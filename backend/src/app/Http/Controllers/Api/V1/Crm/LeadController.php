<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Crm;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\StoreLeadActivityRequest;
use App\Http\Requests\Crm\StoreLeadNoteRequest;
use App\Http\Requests\Crm\StoreLeadRequest;
use App\Http\Requests\Crm\UpdateLeadRequest;
use App\Http\Resources\LeadActivityResource;
use App\Http\Resources\LeadNoteResource;
use App\Http\Resources\LeadResource;
use App\Models\Lead;
use App\Services\Crm\LeadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LeadController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(private readonly LeadService $leadService) {}

    public function index(Request $request): JsonResponse
    {
        $leads = $this->leadService->listForUser($request->user(), [
            'company_id' => $this->resolveCompanyContextId($request->input('company_id')),
            'search' => $request->string('search')->toString(),
            'status' => $request->string('status')->toString(),
            'priority' => $request->string('priority')->toString(),
            'source' => $request->string('source')->toString(),
            'assigned_to_user_id' => $request->input('assigned_to_user_id'),
        ]);

        return $this->success(
            message: 'CRM leads fetched successfully.',
            data: [
                'items' => LeadResource::collection($leads->items()),
                'pagination' => [
                    'next_page_url' => $leads->nextPageUrl(),
                    'prev_page_url' => $leads->previousPageUrl(),
                    'per_page' => $leads->perPage(),
                ],
            ],
        );
    }

    public function store(StoreLeadRequest $request): JsonResponse
    {
        $lead = $this->leadService->create($request->user(), $request->validated());

        return $this->success(
            message: 'CRM lead created successfully.',
            data: ['lead' => new LeadResource($lead)],
            status: 201,
        );
    }

    public function show(Request $request, Lead $lead): JsonResponse
    {
        $lead = $this->leadService->findForUser(
            $request->user(),
            $lead,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'CRM lead fetched successfully.',
            data: ['lead' => new LeadResource($lead)],
        );
    }

    public function update(UpdateLeadRequest $request, Lead $lead): JsonResponse
    {
        $lead = $this->leadService->update($request->user(), $lead, $request->validated());

        return $this->success(
            message: 'CRM lead updated successfully.',
            data: ['lead' => new LeadResource($lead)],
        );
    }

    public function storeNote(StoreLeadNoteRequest $request, Lead $lead): JsonResponse
    {
        $note = $this->leadService->addNote(
            $request->user(),
            $lead,
            $request->string('note')->toString(),
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Lead note added successfully.',
            data: ['note' => new LeadNoteResource($note)],
            status: 201,
        );
    }

    public function storeActivity(StoreLeadActivityRequest $request, Lead $lead): JsonResponse
    {
        $activity = $this->leadService->addActivity(
            $request->user(),
            $lead,
            $request->validated(),
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Lead activity added successfully.',
            data: ['activity' => new LeadActivityResource($activity)],
            status: 201,
        );
    }

    public function pipeline(Request $request): JsonResponse
    {
        $summary = $this->leadService->pipelineSummary(
            $request->user(),
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'CRM pipeline fetched successfully.',
            data: $summary,
        );
    }
}
