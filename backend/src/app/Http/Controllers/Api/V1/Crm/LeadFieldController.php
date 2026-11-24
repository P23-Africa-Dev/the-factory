<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Crm;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\StoreLeadFieldRequest;
use App\Http\Requests\Crm\UpdateLeadFieldRequest;
use App\Http\Resources\LeadFieldDefinitionResource;
use App\Models\LeadFieldDefinition;
use App\Services\Crm\LeadFieldService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LeadFieldController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(private readonly LeadFieldService $leadFieldService) {}

    public function index(Request $request): JsonResponse
    {
        $fields = $this->leadFieldService->list(
            $request->user(),
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Lead fields fetched successfully.',
            data: ['items' => LeadFieldDefinitionResource::collection($fields)],
        );
    }

    public function store(StoreLeadFieldRequest $request): JsonResponse
    {
        $field = $this->leadFieldService->create($request->user(), $request->validated());
        $pendingUniversal = $field->universal_request_status === 'pending';

        return $this->success(
            message: $pendingUniversal
                ? 'Lead field saved on this lead. Universal use is awaiting approval.'
                : 'Lead field created successfully.',
            data: ['field' => new LeadFieldDefinitionResource($field)],
            status: 201,
        );
    }

    public function update(UpdateLeadFieldRequest $request, LeadFieldDefinition $leadField): JsonResponse
    {
        $field = $this->leadFieldService->update($request->user(), $leadField, $request->validated());

        return $this->success(
            message: 'Lead field updated successfully.',
            data: ['field' => new LeadFieldDefinitionResource($field)],
        );
    }

    public function destroy(Request $request, LeadFieldDefinition $leadField): JsonResponse
    {
        $this->leadFieldService->delete(
            $request->user(),
            $leadField,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Lead field deleted.',
            data: null,
        );
    }

    public function reorder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'company_id' => ['nullable', 'integer'],
            'ordered_ids' => ['required', 'array', 'min:1'],
            'ordered_ids.*' => ['integer'],
        ]);

        $fields = $this->leadFieldService->reorder($request->user(), $data);

        return $this->success(
            message: 'Lead fields reordered.',
            data: ['items' => LeadFieldDefinitionResource::collection($fields)],
        );
    }

    public function approve(Request $request, LeadFieldDefinition $leadField): JsonResponse
    {
        $field = $this->leadFieldService->approve(
            $request->user(),
            $leadField,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Lead field approved as universal.',
            data: ['field' => new LeadFieldDefinitionResource($field)],
        );
    }

    public function decline(Request $request, LeadFieldDefinition $leadField): JsonResponse
    {
        $data = $request->validate([
            'company_id' => ['nullable', 'integer'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $field = $this->leadFieldService->decline(
            $request->user(),
            $leadField,
            $this->resolveCompanyContextId($data['company_id'] ?? null),
            isset($data['reason']) ? (string) $data['reason'] : null,
        );

        return $this->success(
            message: 'Universal request declined. The field stays on existing leads only.',
            data: ['field' => new LeadFieldDefinitionResource($field)],
        );
    }

    public function archive(Request $request, LeadFieldDefinition $leadField): JsonResponse
    {
        $field = $this->leadFieldService->archive(
            $request->user(),
            $leadField,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Lead field archived.',
            data: ['field' => new LeadFieldDefinitionResource($field)],
        );
    }

    public function restore(Request $request, LeadFieldDefinition $leadField): JsonResponse
    {
        $field = $this->leadFieldService->restore(
            $request->user(),
            $leadField,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Lead field restored.',
            data: ['field' => new LeadFieldDefinitionResource($field)],
        );
    }
}
