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
        $viewer = $this->locationService->viewerContext(
            $request->user(),
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        $locations = $this->locationService->listForUser($request->user(), [
            'company_id' => $viewer['company_id'],
            'q' => $request->string('q')->toString(),
            'type' => $request->string('type')->toString(),
            'is_active' => $request->has('is_active') ? $request->boolean('is_active') : null,
            'per_page' => $request->input('per_page'),
            'min_lat' => $request->input('min_lat'),
            'max_lat' => $request->input('max_lat'),
            'min_lng' => $request->input('min_lng'),
            'max_lng' => $request->input('max_lng'),
        ]);

        return $this->success(
            message: 'Locations fetched successfully.',
            data: [
                'items' => $this->locationCollection($locations->items(), $viewer, (int) $request->user()->id),
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
        $validated = $request->validated();
        $viewer = $this->locationService->viewerContext(
            $request->user(),
            isset($validated['company_id']) ? (int) $validated['company_id'] : null,
        );

        $location = $this->locationService->create($request->user(), $validated);

        return $this->success(
            message: 'Location created successfully.',
            data: ['location' => $this->locationResource($location, $viewer, (int) $request->user()->id)],
            status: 201,
        );
    }

    public function show(Request $request, CompanyLocation $location): JsonResponse
    {
        $viewer = $this->locationService->viewerContext(
            $request->user(),
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        $location = $this->locationService->findForUser(
            $request->user(),
            $location,
            $viewer['company_id'],
        );

        return $this->success(
            message: 'Location fetched successfully.',
            data: ['location' => $this->locationResource($location, $viewer, (int) $request->user()->id)],
        );
    }

    public function update(UpdateCompanyLocationRequest $request, CompanyLocation $location): JsonResponse
    {
        $validated = $request->validated();
        $viewer = $this->locationService->viewerContext(
            $request->user(),
            isset($validated['company_id']) ? (int) $validated['company_id'] : null,
        );

        $location = $this->locationService->update($request->user(), $location, $validated);

        return $this->success(
            message: 'Location updated successfully.',
            data: ['location' => $this->locationResource($location, $viewer, (int) $request->user()->id)],
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

    /**
     * @param  array{company_id: int, role: string}  $viewer
     */
    private function locationResource(CompanyLocation $location, array $viewer, int $viewerUserId): CompanyLocationResource
    {
        return (new CompanyLocationResource($location))
            ->withViewerContext($viewer['company_id'], $viewer['role'], $viewerUserId);
    }

    /**
     * @param  array<int, CompanyLocation>  $locations
     * @param  array{company_id: int, role: string}  $viewer
     * @return array<int, CompanyLocationResource>
     */
    private function locationCollection(array $locations, array $viewer, int $viewerUserId): array
    {
        return array_map(
            fn(CompanyLocation $location): CompanyLocationResource => $this->locationResource($location, $viewer, $viewerUserId),
            $locations,
        );
    }
}
