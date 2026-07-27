<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Places;

use App\Http\Controllers\Controller;
use App\Services\Company\CompanyContextService;
use App\Services\Places\UserPlaceRecentsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlaceRecentsController extends Controller
{
    public function __construct(
        private readonly UserPlaceRecentsService $recents,
        private readonly CompanyContextService $companyContext,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user === null) {
            return response()->json([
                'success' => false,
                'message' => 'Authentication required.',
                'data' => null,
                'errors' => ['auth' => ['Unauthenticated.']],
            ], 401);
        }

        $limit = min(15, max(1, (int) $request->query('limit', 15)));
        $data = $this->recents->listForUser($user, $limit);

        return response()->json([
            'success' => true,
            'message' => 'Recent places.',
            'data' => $data,
            'errors' => null,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user === null) {
            return response()->json([
                'success' => false,
                'message' => 'Authentication required.',
                'data' => null,
                'errors' => ['auth' => ['Unauthenticated.']],
            ], 401);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:512'],
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'provider' => ['nullable', 'string', 'max:32'],
            'provider_place_id' => ['nullable', 'string', 'max:191'],
            'company_id' => ['nullable', 'integer'],
        ]);

        $company = null;
        try {
            ['company' => $company] = $this->companyContext->resolve(
                $user,
                isset($validated['company_id']) ? (int) $validated['company_id'] : null,
            );
        } catch (\Throwable) {
            $company = null;
        }

        try {
            $row = $this->recents->remember($user, [
                'name' => $validated['name'],
                'address' => $validated['address'] ?? null,
                'latitude' => (float) $validated['latitude'],
                'longitude' => (float) $validated['longitude'],
                'provider' => $validated['provider'] ?? null,
                'provider_place_id' => $validated['provider_place_id'] ?? null,
            ], $company);
        } catch (\InvalidArgumentException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'data' => null,
                'errors' => ['place' => [$e->getMessage()]],
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Recent place saved.',
            'data' => $row,
            'errors' => null,
        ], 201);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if ($user === null) {
            return response()->json([
                'success' => false,
                'message' => 'Authentication required.',
                'data' => null,
                'errors' => ['auth' => ['Unauthenticated.']],
            ], 401);
        }

        $ok = $this->recents->forget($user, $id);

        return response()->json([
            'success' => $ok,
            'message' => $ok ? 'Recent place removed.' : 'Recent place not found.',
            'data' => null,
            'errors' => null,
        ], $ok ? 200 : 404);
    }
}
