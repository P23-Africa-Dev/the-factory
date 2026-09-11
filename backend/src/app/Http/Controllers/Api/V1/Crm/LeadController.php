<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Crm;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\ExportLeadsRequest;
use App\Http\Requests\Crm\ImportLeadsRequest;
use App\Http\Requests\Crm\StoreLeadActivityRequest;
use App\Http\Requests\Crm\StoreLeadNoteRequest;
use App\Http\Requests\Crm\StoreLeadRequest;
use App\Http\Requests\Crm\UpdateLeadRequest;
use App\Http\Resources\LeadActivityResource;
use App\Http\Resources\LeadAssigneeResource;
use App\Http\Resources\LeadNoteResource;
use App\Http\Resources\LeadResource;
use App\Models\Lead;
use App\Services\Crm\LeadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

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
            'pipeline_id' => $request->input('pipeline_id'),
            'source' => $request->string('source')->toString(),
            'assigned_to_user_id' => $request->input('assigned_to_user_id'),
            'per_page' => $request->input('per_page'),
            'uncategorized' => $request->boolean('uncategorized'),
        ]);

        return $this->success(
            message: 'CRM leads fetched successfully.',
            data: [
                'items' => LeadResource::collection($leads->items()),
                'pagination' => [
                    'next_page_url' => $leads->nextPageUrl(),
                    'prev_page_url' => $leads->previousPageUrl(),
                    'per_page' => $leads->perPage(),
                    'current_page' => method_exists($leads, 'currentPage') ? $leads->currentPage() : 1,
                    'last_page' => method_exists($leads, 'lastPage') ? $leads->lastPage() : 1,
                    'total' => method_exists($leads, 'total') ? $leads->total() : null,
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

    public function checkDuplicate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'company_id' => ['nullable', 'integer'],
            'email' => ['nullable', 'email', 'max:255'],
            'name' => ['nullable', 'string', 'max:255'],
            'company_name' => ['nullable', 'string', 'max:255'],
        ]);

        $result = $this->leadService->checkDuplicate($request->user(), [
            'company_id' => $this->resolveCompanyContextId($data['company_id'] ?? null),
            'email' => $data['email'] ?? null,
            'name' => $data['name'] ?? null,
            'company_name' => $data['company_name'] ?? null,
        ]);

        return $this->success(
            message: $result['exists'] ? 'Duplicate lead found.' : 'No duplicate lead found.',
            data: [
                'exists' => $result['exists'],
                'match_reason' => $result['match_reason'],
                'lead' => $result['lead'] ? new LeadResource($result['lead']) : null,
            ],
        );
    }

    public function merge(Request $request, Lead $lead): JsonResponse
    {
        $data = $request->validate([
            'company_id' => ['nullable', 'integer'],
            'strategy' => ['nullable', 'string', 'in:only_new_fields,better_quality,always_update'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:40'],
            'location' => ['nullable', 'string', 'max:255'],
            'company_name' => ['nullable', 'string', 'max:255'],
            'company_email' => ['nullable', 'email', 'max:255'],
            'website' => ['nullable', 'string', 'max:255'],
            'position' => ['nullable', 'string', 'max:120'],
            'profile_urls' => ['nullable', 'array'],
            'profile_urls.*' => ['nullable', 'string', 'max:2048'],
            'next_action' => ['nullable', 'string', 'max:255'],
        ]);

        $strategy = (string) ($data['strategy'] ?? 'better_quality');
        unset($data['strategy']);
        $data['company_id'] = $this->resolveCompanyContextId($data['company_id'] ?? null);

        $result = $this->leadService->merge($request->user(), $lead, $data, $strategy);

        return $this->success(
            message: $result['updated']
                ? 'CRM lead updated with richer fields.'
                : 'CRM lead already up to date.',
            data: [
                'updated' => $result['updated'],
                'fields_changed' => $result['fields_changed'],
                'lead' => new LeadResource($result['lead']),
            ],
        );
    }

    public function assignees(Request $request): JsonResponse
    {
        $assignees = $this->leadService->listAssignees(
            $request->user(),
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'CRM assignees fetched successfully.',
            data: ['items' => LeadAssigneeResource::collection($assignees)],
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

    public function destroy(Request $request, Lead $lead): JsonResponse
    {
        $this->leadService->delete(
            $request->user(),
            $lead,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'CRM lead deleted successfully.',
            data: ['deleted_lead_id' => $lead->id],
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

    public function agentUploadsOverview(Request $request): JsonResponse
    {
        $overview = $this->leadService->agentUploadsOverview(
            $request->user(),
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'CRM agent upload overview fetched successfully.',
            data: $overview,
        );
    }

    public function leadsAnalytics(Request $request): JsonResponse
    {
        $analytics = $this->leadService->leadsAnalytics(
            $request->user(),
            $this->resolveCompanyContextId($request->input('company_id')),
            [
                'search' => $request->string('search')->toString(),
                'status' => $request->string('status')->toString(),
                'pipeline_id' => $request->input('pipeline_id'),
                'source' => $request->string('source')->toString(),
            ],
        );

        return $this->success(
            message: 'CRM leads analytics fetched successfully.',
            data: $analytics,
        );
    }

    public function pipelines(Request $request): JsonResponse
    {
        $companyId = $this->resolveCompanyContextId($request->input('company_id'));
        $items = $this->leadService->listPipelines($request->user(), $companyId);

        return $this->success(
            message: 'CRM pipelines fetched successfully.',
            data: ['items' => $items],
        );
    }

    public function storePipeline(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable'],
            'name' => ['required', 'string', 'max:120'],
        ]);
        $validated['company_id'] = $this->resolveCompanyContextId($request->input('company_id'));

        $pipeline = $this->leadService->createPipeline($request->user(), $validated);

        return $this->success(
            message: 'CRM pipeline created successfully.',
            data: ['pipeline' => $pipeline],
            status: 201,
        );
    }

    public function updatePipeline(Request $request, int $pipeline): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable'],
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
        ]);
        $validated['company_id'] = $this->resolveCompanyContextId($request->input('company_id'));

        $updated = $this->leadService->updatePipeline($request->user(), $pipeline, $validated);

        return $this->success(
            message: 'CRM pipeline updated successfully.',
            data: ['pipeline' => $updated],
        );
    }

    public function deletePipeline(Request $request, int $pipeline): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable'],
            'force' => ['sometimes', 'boolean'],
        ]);
        $validated['company_id'] = $this->resolveCompanyContextId($request->input('company_id'));

        $result = $this->leadService->deletePipeline($request->user(), $pipeline, $validated);

        return $this->success(
            message: 'CRM pipeline deleted successfully.',
            data: $result,
        );
    }

    public function preferences(Request $request): JsonResponse
    {
        $companyId = $this->resolveCompanyContextId($request->input('company_id'));
        $preferences = $this->leadService->getCrmPreferences($request->user(), $companyId);

        return $this->success(
            message: 'CRM preferences fetched successfully.',
            data: $preferences,
        );
    }

    public function setPreferredPipeline(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable'],
            'pipeline_id' => ['required', 'integer', 'exists:lead_pipelines,id'],
        ]);
        $validated['company_id'] = $this->resolveCompanyContextId($request->input('company_id'));

        $preferences = $this->leadService->setPreferredPipeline($request->user(), $validated);

        return $this->success(
            message: 'Preferred pipeline updated successfully.',
            data: $preferences,
        );
    }

    public function setCompanyDefaultPipeline(Request $request, int $pipeline): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable'],
        ]);
        $validated['company_id'] = $this->resolveCompanyContextId($request->input('company_id'));

        $updated = $this->leadService->setCompanyDefaultPipeline($request->user(), $pipeline, $validated);

        return $this->success(
            message: 'Company default pipeline updated successfully.',
            data: ['pipeline' => $updated],
        );
    }

    public function labels(Request $request): JsonResponse
    {
        $companyId = $this->resolveCompanyContextId($request->input('company_id'));
        $items = $this->leadService->listLabels($request->user(), $companyId);

        return $this->success(
            message: 'CRM labels fetched successfully.',
            data: ['items' => $items],
        );
    }

    public function storeLabel(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable'],
            'name' => ['required', 'string', 'max:120'],
            'color' => ['nullable', 'string', 'max:20'],
        ]);
        $validated['company_id'] = $this->resolveCompanyContextId($request->input('company_id'));

        $label = $this->leadService->createLabel($request->user(), $validated);

        return $this->success(
            message: 'CRM label created successfully.',
            data: ['label' => $label],
            status: 201,
        );
    }

    public function updateLabel(Request $request, int $label): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable'],
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'color' => ['sometimes', 'required', 'string', 'max:20'],
        ]);
        $validated['company_id'] = $this->resolveCompanyContextId($request->input('company_id'));

        $updated = $this->leadService->updateLabel($request->user(), $label, $validated);

        return $this->success(
            message: 'CRM label updated successfully.',
            data: ['label' => $updated],
        );
    }

    public function reorderLabels(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable'],
            'ordered_label_ids' => ['required', 'array', 'min:1'],
            'ordered_label_ids.*' => ['integer'],
        ]);
        $validated['company_id'] = $this->resolveCompanyContextId($request->input('company_id'));

        $items = $this->leadService->reorderLabels($request->user(), $validated);

        return $this->success(
            message: 'CRM labels reordered successfully.',
            data: ['items' => $items],
        );
    }

    public function deleteLabel(Request $request, int $label): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable'],
            'force' => ['sometimes', 'boolean'],
        ]);
        $validated['company_id'] = $this->resolveCompanyContextId($request->input('company_id'));

        $result = $this->leadService->deleteLabel($request->user(), $label, $validated);

        return $this->success(
            message: 'CRM label deleted successfully.',
            data: $result,
        );
    }

    public function import(ImportLeadsRequest $request): JsonResponse
    {
        $result = $this->leadService->importLeads($request->user(), $request->validated());

        return $this->success(
            message: 'CRM lead import completed.',
            data: $result,
        );
    }

    public function importPreview(ImportLeadsRequest $request): JsonResponse
    {
        $result = $this->leadService->previewImportLeads($request->user(), $request->validated());

        return $this->success(
            message: 'CRM lead import preview generated.',
            data: $result,
        );
    }

    public function export(ExportLeadsRequest $request): StreamedResponse
    {
        $export = $this->leadService->exportLeads($request->user(), $request->validated());

        return response()->streamDownload(
            static function () use ($export): void {
                $stream = $export['stream'] ?? null;
                if (is_callable($stream)) {
                    $stream();
                }
            },
            $export['filename'],
            [
                'Content-Type' => $export['content_type'],
                'Cache-Control' => 'no-store, no-cache, must-revalidate',
                'Pragma' => 'no-cache',
                'X-Content-Type-Options' => 'nosniff',
            ],
        );
    }
}
