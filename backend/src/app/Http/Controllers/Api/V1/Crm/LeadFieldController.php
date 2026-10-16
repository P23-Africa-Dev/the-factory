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

        return $this->success(
            message: $field->status?->value === 'pending'
                ? 'Lead field submitted for approval.'
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

    public function approve(Request $request, LeadFieldDefinition $leadField): JsonResponse
    {
        $field = $this->leadFieldService->approve(
            $request->user(),
            $leadField,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Lead field approved.',
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
            message: 'Lead field declined.',
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
