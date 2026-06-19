<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Company;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Http\Requests\Company\StoreCompanyLocationRequest;
use App\Http\Requests\Company\UpdateCompanyLocationRequest;
use App\Http\Resources\CompanyLocationResource;
use App\Models\CompanyLocation;
use App\Services\Company\CompanyLocationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CompanyLocationController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(private readonly CompanyLocationService $locationService) {}

    public function index(Request $request): JsonResponse
    {
        $locations = $this->locationService->listForUser($request->user(), [
            'company_id' => $this->resolveCompanyContextId($request->input('company_id')),
            'q' => $request->string('q')->toString(),
            'type' => $request->string('type')->toString(),
            'is_active' => $request->has('is_active') ? $request->boolean('is_active') : null,
            'per_page' => $request->input('per_page'),
        ]);

        return $this->success(
            message: 'Locations fetched successfully.',
            data: [
                'items' => CompanyLocationResource::collection($locations->items()),
                'pagination' => [
                    'next_page_url' => $locations->nextPageUrl(),
                    'prev_page_url' => $locations->previousPageUrl(),
                    'per_page' => $locations->perPage(),
                    'current_page' => method_exists($locations, 'currentPage') ? $locations->currentPage() : 1,
                    'last_page' => method_exists($locations, 'lastPage') ? $locations->lastPage() : 1,
                    'total' => method_exists($locations, 'total') ? $locations->total() : null,
                ],
            ],
        );
    }

    public function store(StoreCompanyLocationRequest $request): JsonResponse
    {
        $location = $this->locationService->create($request->user(), $request->validated());

        return $this->success(
            message: 'Location created successfully.',
            data: ['location' => new CompanyLocationResource($location)],
            status: 201,
        );
    }

    public function show(Request $request, CompanyLocation $location): JsonResponse
    {
        $location = $this->locationService->findForUser(
            $request->user(),
            $location,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Location fetched successfully.',
            data: ['location' => new CompanyLocationResource($location)],
        );
    }

    public function update(UpdateCompanyLocationRequest $request, CompanyLocation $location): JsonResponse
    {
        $location = $this->locationService->update($request->user(), $location, $request->validated());

        return $this->success(
            message: 'Location updated successfully.',
            data: ['location' => new CompanyLocationResource($location)],
        );
    }

    public function destroy(Request $request, CompanyLocation $location): JsonResponse
    {
        $this->locationService->delete(
            $request->user(),
            $location,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Location deleted successfully.',
            data: ['deleted_location_id' => (int) $location->id],
        );
    }
}
