<?php

declare(strict_types=1);

namespace App\Services\Crm;

use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Models\Lead;
use App\Models\LeadActivity;
use App\Models\LeadLabel;
use App\Models\LeadNote;
use App\Models\LeadPipeline;
use App\Models\User;
use App\Services\Company\CompanyContextService;
use App\Services\Notification\NotificationService;
use App\Support\AvatarUrlResolver;
use Illuminate\Contracts\Pagination\Paginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class LeadService
{
    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly NotificationService $notificationService,
    ) {}

    public function listForUser(User $user, array $filters): Paginator
    {
        $context = $this->companyContextService->resolve($user, $filters['company_id'] ?? null);
        $companyId = (int) $context['company']->id;
        $role = (string) $context['role'];
        $this->ensureDefaultCrmSetup($companyId);

        $query = $this->baseQuery($companyId);

        if ($role === 'agent') {
            $this->applyAgentLeadScope($query, (int) $user->id);
        }

        if (! empty($filters['status'])) {
            $query->where('status', (string) $filters['status']);
        }

        if (! empty($filters['priority'])) {
            $query->where('priority', (string) $filters['priority']);
        }

        if (! empty($filters['pipeline_id'])) {
            $query->where('pipeline_id', (int) $filters['pipeline_id']);
        }

        if (! empty($filters['assigned_to_user_id'])) {
            $query->where('assigned_to_user_id', (int) $filters['assigned_to_user_id']);
        }

        if (! empty($filters['source'])) {
            $source = (string) $filters['source'];

            if ($this->isAgentUploadSourceFilter($source)) {
                $this->applyAgentUploadedSourceFilter($query);
            } else {
                $query->where('source', 'like', '%' . $source . '%');
            }
        }

        if (! empty($filters['search'])) {
            $search = trim((string) $filters['search']);
            $query->where(function (Builder $builder) use ($search): void {
                $builder->where('name', 'like', '%' . $search . '%')
                    ->orWhere('email', 'like', '%' . $search . '%')
                    ->orWhere('phone', 'like', '%' . $search . '%')
                    ->orWhere('location', 'like', '%' . $search . '%');
            });
        }

        $perPage = (int) ($filters['per_page'] ?? 20);

        return $query->latest('id')->paginate($perPage)->withQueryString();
    }

    public function create(User $user, array $data): Lead
    {
        $context = $this->companyContextService->resolve($user, $data['company_id'] ?? null);
        $role = (string) $context['role'];
        $this->ensureCanCreateLeads($role);

        $companyId = (int) $context['company']->id;
        $this->ensureDefaultCrmSetup($companyId);

        $assignedToUserId = $role === 'agent'
            ? (int) $user->id
            : (isset($data['assigned_to_user_id']) ? (int) $data['assigned_to_user_id'] : null);
        $pipelineId = (int) ($data['pipeline_id'] ?? 0);

        $this->assertPipelineInCompany($companyId, $pipelineId);
        $this->assertLabelExists($companyId, (string) $data['status']);

        if ($assignedToUserId !== null) {
            $this->assertMemberInCompany($companyId, $assignedToUserId, 'assigned_to_user_id');
        }

        $lead = Lead::create([
            'company_id' => $companyId,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $user->id,
            'assigned_to_user_id' => $assignedToUserId,
            'name' => $data['name'],
            'email' => $data['email'] ?? null,
            'phone' => $data['phone'] ?? null,
            'location' => $data['location'] ?? null,
            'source' => $data['source'] ?? null,
            'status' => $data['status'],
            'priority' => $data['priority'],
            'next_action' => $data['next_action'] ?? null,
            'last_interaction' => $data['last_interaction'] ?? null,
            'last_interaction_at' => $data['last_interaction_at'] ?? null,
            'meta' => $data['meta'] ?? null,
        ]);

        $this->notifyLeadRecipients(
            lead: $lead,
            actor: $user,
            type: 'crm.lead_created',
            title: 'New CRM lead created',
            message: "Lead '{$lead->name}' has been created.",
            priority: NotificationPriority::HIGH->value,
        );

        return $this->findForUser($user, $lead, $companyId);
    }

    public function findForUser(User $user, Lead $lead, ?int $companyId = null): Lead
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $role = (string) $context['role'];
        $this->ensureDefaultCrmSetup($resolvedCompanyId);
        $this->assertLeadInCompany($lead, $resolvedCompanyId);

        if ($role === 'agent') {
            $this->assertAgentCanAccessLead($lead, (int) $user->id);
        }

        return $this->baseQuery($resolvedCompanyId)
            ->whereKey($lead->id)
            ->firstOrFail();
    }

    public function update(User $user, Lead $lead, array $data): Lead
    {
        $context = $this->companyContextService->resolve($user, $data['company_id'] ?? null);
        $role = (string) $context['role'];

        $companyId = (int) $context['company']->id;
        $this->ensureDefaultCrmSetup($companyId);
        $this->assertLeadInCompany($lead, $companyId);

        if ($role === 'agent') {
            $this->assertAgentCanAccessLead($lead, (int) $user->id);

            $allowedFields = ['company_id', 'pipeline_id', 'status'];
            $forbiddenFields = collect(array_keys($data))
                ->reject(static fn(string $field): bool => in_array($field, $allowedFields, true))
                ->values()
                ->all();

            if ($forbiddenFields !== []) {
                throw ValidationException::withMessages([
                    'authorization' => ['Agents can only update lead status and pipeline.'],
                    'forbidden_fields' => $forbiddenFields,
                ]);
            }

            if (array_key_exists('pipeline_id', $data)) {
                $this->assertPipelineInCompany($companyId, (int) $data['pipeline_id']);
            }

            if (array_key_exists('status', $data) && $data['status'] !== null) {
                $this->assertLabelExists($companyId, (string) $data['status']);
            }

            $lead->update([
                'pipeline_id' => array_key_exists('pipeline_id', $data) ? (int) $data['pipeline_id'] : $lead->pipeline_id,
                'status' => array_key_exists('status', $data) ? (string) $data['status'] : $lead->status,
            ]);

            return $this->findForUser($user, $lead->fresh(), $companyId);
        }

        $this->ensureCanManage($role);

        if (array_key_exists('assigned_to_user_id', $data) && $data['assigned_to_user_id'] !== null) {
            $this->assertMemberInCompany($companyId, (int) $data['assigned_to_user_id'], 'assigned_to_user_id');
        }

        if (array_key_exists('pipeline_id', $data)) {
            $this->assertPipelineInCompany($companyId, (int) $data['pipeline_id']);
        }

        if (array_key_exists('status', $data) && $data['status'] !== null) {
            $this->assertLabelExists($companyId, (string) $data['status']);
        }

        $lead->update([
            'pipeline_id' => array_key_exists('pipeline_id', $data) ? (int) $data['pipeline_id'] : $lead->pipeline_id,
            'assigned_to_user_id' => array_key_exists('assigned_to_user_id', $data)
                ? ($data['assigned_to_user_id'] !== null ? (int) $data['assigned_to_user_id'] : null)
                : $lead->assigned_to_user_id,
            'name' => $data['name'] ?? $lead->name,
            'email' => array_key_exists('email', $data) ? $data['email'] : $lead->email,
            'phone' => array_key_exists('phone', $data) ? $data['phone'] : $lead->phone,
            'location' => array_key_exists('location', $data) ? $data['location'] : $lead->location,
            'source' => array_key_exists('source', $data) ? $data['source'] : $lead->source,
            'status' => $data['status'] ?? $lead->status,
            'priority' => $data['priority'] ?? $lead->priority,
            'next_action' => array_key_exists('next_action', $data) ? $data['next_action'] : $lead->next_action,
            'last_interaction' => array_key_exists('last_interaction', $data) ? $data['last_interaction'] : $lead->last_interaction,
            'last_interaction_at' => array_key_exists('last_interaction_at', $data) ? $data['last_interaction_at'] : $lead->last_interaction_at,
            'meta' => array_key_exists('meta', $data) ? $data['meta'] : $lead->meta,
            'converted_at' => array_key_exists('converted_at', $data) ? $data['converted_at'] : $lead->converted_at,
        ]);

        $this->notifyLeadRecipients(
            lead: $lead,
            actor: $user,
            type: 'crm.lead_updated',
            title: 'CRM lead updated',
            message: "Lead '{$lead->name}' has been updated.",
            priority: NotificationPriority::NORMAL->value,
        );

        return $this->findForUser($user, $lead->fresh(), $companyId);
    }

    public function addNote(User $user, Lead $lead, string $note, ?int $companyId = null): LeadNote
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $role = (string) $context['role'];
        $this->ensureDefaultCrmSetup($resolvedCompanyId);
        $this->assertLeadInCompany($lead, $resolvedCompanyId);

        if ($role === 'agent') {
            $this->assertAgentCanAccessLead($lead, (int) $user->id);
        }

        $leadNote = LeadNote::create([
            'lead_id' => $lead->id,
            'company_id' => $resolvedCompanyId,
            'created_by_user_id' => $user->id,
            'note' => $note,
        ]);

        $this->notifyLeadRecipients(
            lead: $lead,
            actor: $user,
            type: 'crm.lead_note_added',
            title: 'CRM lead note added',
            message: "A new note was added to lead '{$lead->name}'.",
            priority: NotificationPriority::NORMAL->value,
        );

        return $leadNote->load('creator:id,name,email');
    }

    public function addActivity(User $user, Lead $lead, array $payload, ?int $companyId = null): LeadActivity
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $role = (string) $context['role'];
        $this->ensureDefaultCrmSetup($resolvedCompanyId);
        $this->assertLeadInCompany($lead, $resolvedCompanyId);

        if ($role === 'agent') {
            $this->assertAgentCanAccessLead($lead, (int) $user->id);
        }

        $activity = LeadActivity::create([
            'lead_id' => $lead->id,
            'company_id' => $resolvedCompanyId,
            'created_by_user_id' => $user->id,
            'type' => $payload['type'],
            'title' => $payload['title'] ?? null,
            'description' => $payload['description'] ?? null,
            'happened_at' => $payload['happened_at'] ?? null,
            'meta' => $payload['meta'] ?? null,
        ]);

        $this->notifyLeadRecipients(
            lead: $lead,
            actor: $user,
            type: 'crm.lead_activity_added',
            title: 'CRM lead activity added',
            message: "A new activity was logged for lead '{$lead->name}'.",
            priority: NotificationPriority::NORMAL->value,
        );

        return $activity->load('creator:id,name,email');
    }

    public function pipelineSummary(User $user, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $role = (string) $context['role'];
        $this->ensureDefaultCrmSetup($resolvedCompanyId);

        $labels = LeadLabel::query()
            ->where('company_id', $resolvedCompanyId)
            ->orderBy('sort_order')
            ->get(['slug', 'name', 'color']);

        $countsQuery = Lead::query()->where('company_id', $resolvedCompanyId);
        if ($role === 'agent') {
            $this->applyAgentLeadScope($countsQuery, (int) $user->id);
        }

        $counts = $countsQuery
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status')
            ->all();

        $total = (int) array_sum(array_map(static fn($value): int => (int) $value, $counts));

        return [
            'total' => $total,
            'stages' => $labels->map(static function (LeadLabel $label) use ($counts): array {
                return [
                    'status' => $label->slug,
                    'name' => $label->name,
                    'color' => $label->color,
                    'count' => (int) ($counts[$label->slug] ?? 0),
                ];
            })->all(),
        ];
    }

    public function agentUploadsOverview(User $user, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $role = (string) $context['role'];
        $this->ensureDefaultCrmSetup($resolvedCompanyId);

        $baseQuery = Lead::query()->where('company_id', $resolvedCompanyId);
        $this->applyAgentUploadedSourceFilter($baseQuery);

        if ($role === 'agent') {
            $this->applyAgentLeadScope($baseQuery, (int) $user->id);
        }

        $totalUploadedLeads = (int) (clone $baseQuery)->count();

        $topUploader = (clone $baseQuery)
            ->whereNotNull('created_by_user_id')
            ->selectRaw('created_by_user_id, COUNT(*) as total_uploads')
            ->groupBy('created_by_user_id')
            ->orderByDesc('total_uploads')
            ->orderBy('created_by_user_id')
            ->first();

        $topAgent = null;
        if ($topUploader !== null && $topUploader->created_by_user_id !== null) {
            $agent = User::query()
                ->whereKey((int) $topUploader->created_by_user_id)
                ->first(['id', 'name', 'email', 'avatar', 'gender']);

            if ($agent !== null) {
                $topAgent = [
                    'id' => (int) $agent->id,
                    'name' => (string) $agent->name,
                    'email' => (string) $agent->email,
                    'avatar_url' => AvatarUrlResolver::resolve($agent->avatar, $agent->gender),
                    'total_uploads' => (int) $topUploader->total_uploads,
                ];
            }
        }

        if ($topAgent === null) {
            $fallbackAgent = $this->resolveFallbackAgentForUploadsOverview(
                companyId: $resolvedCompanyId,
                role: $role,
                actor: $user,
            );

            if ($fallbackAgent !== null) {
                $topAgent = [
                    'id' => (int) $fallbackAgent->id,
                    'name' => (string) $fallbackAgent->name,
                    'email' => (string) $fallbackAgent->email,
                    'avatar_url' => AvatarUrlResolver::resolve($fallbackAgent->avatar, $fallbackAgent->gender),
                    'total_uploads' => 0,
                ];
            }
        }

        $recentLeads = (clone $baseQuery)
            ->with(['creator:id,name,email,avatar,gender'])
            ->latest('id')
            ->limit(5)
            ->get(['id', 'name', 'status', 'source', 'created_by_user_id', 'created_at'])
            ->map(static function (Lead $lead): array {
                return [
                    'id' => (int) $lead->id,
                    'name' => (string) $lead->name,
                    'status' => (string) $lead->status,
                    'source' => $lead->source,
                    'created_at' => $lead->created_at?->toIso8601String(),
                    'creator' => $lead->creator ? [
                        'id' => (int) $lead->creator->id,
                        'name' => (string) $lead->creator->name,
                        'email' => (string) $lead->creator->email,
                        'avatar_url' => AvatarUrlResolver::resolve($lead->creator->avatar, $lead->creator->gender),
                    ] : null,
                ];
            })
            ->values()
            ->all();

        return [
            'total_uploaded_leads' => $totalUploadedLeads,
            'top_agent' => $topAgent,
            'recent_leads' => $recentLeads,
            'source_filter' => 'agent_upload',
        ];
    }

    private function resolveFallbackAgentForUploadsOverview(int $companyId, string $role, User $actor): ?User
    {
        if ($role === 'agent') {
            return $actor;
        }

        return User::query()
            ->select('users.id', 'users.name', 'users.email', 'users.avatar', 'users.gender')
            ->join('company_users', 'company_users.user_id', '=', 'users.id')
            ->where('company_users.company_id', $companyId)
            ->where(function (Builder $builder): void {
                $builder->where('company_users.role', 'agent')
                    ->orWhere('users.internal_role', 'agent');
            })
            ->orderBy('users.created_at')
            ->orderBy('users.id')
            ->first();
    }

    public function listPipelines(User $user, ?int $companyId = null): Collection
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $this->ensureDefaultCrmSetup($resolvedCompanyId);

        return LeadPipeline::query()
            ->where('company_id', $resolvedCompanyId)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();
    }

    public function createPipeline(User $user, array $payload): LeadPipeline
    {
        $context = $this->companyContextService->resolve($user, $payload['company_id'] ?? null);
        $this->ensureCanManage((string) $context['role']);
        $companyId = (int) $context['company']->id;
        $this->ensureDefaultCrmSetup($companyId);

        $exists = LeadPipeline::query()
            ->where('company_id', $companyId)
            ->whereRaw('LOWER(name) = ?', [Str::lower((string) $payload['name'])])
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages([
                'name' => ['A pipeline with this name already exists.'],
            ]);
        }

        $maxSortOrder = (int) LeadPipeline::query()->where('company_id', $companyId)->max('sort_order');

        return LeadPipeline::query()->create([
            'company_id' => $companyId,
            'name' => (string) $payload['name'],
            'currency_code' => 'USD',
            'sort_order' => $maxSortOrder + 1,
            'is_default' => false,
        ]);
    }

    public function updatePipeline(User $user, int $pipelineId, array $payload): LeadPipeline
    {
        $context = $this->companyContextService->resolve($user, $payload['company_id'] ?? null);
        $this->ensureCanManage((string) $context['role']);
        $companyId = (int) $context['company']->id;
        $this->ensureDefaultCrmSetup($companyId);

        $pipeline = LeadPipeline::query()
            ->where('company_id', $companyId)
            ->findOrFail($pipelineId);

        if (isset($payload['name'])) {
            $exists = LeadPipeline::query()
                ->where('company_id', $companyId)
                ->where('id', '!=', $pipelineId)
                ->whereRaw('LOWER(name) = ?', [Str::lower((string) $payload['name'])])
                ->exists();

            if ($exists) {
                throw ValidationException::withMessages([
                    'name' => ['A pipeline with this name already exists.'],
                ]);
            }
        }

        $pipeline->update([
            'name' => $payload['name'] ?? $pipeline->name,
            'sort_order' => isset($payload['sort_order']) ? (int) $payload['sort_order'] : $pipeline->sort_order,
        ]);

        return $pipeline->fresh();
    }

    public function listLabels(User $user, ?int $companyId = null): Collection
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $this->ensureDefaultCrmSetup($resolvedCompanyId);

        return LeadLabel::query()
            ->where('company_id', $resolvedCompanyId)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();
    }

    public function createLabel(User $user, array $payload): LeadLabel
    {
        $context = $this->companyContextService->resolve($user, $payload['company_id'] ?? null);
        $this->ensureCanManage((string) $context['role']);
        $companyId = (int) $context['company']->id;
        $this->ensureDefaultCrmSetup($companyId);

        $slug = Str::of((string) $payload['name'])->slug('_')->toString();
        if ($slug === '') {
            throw ValidationException::withMessages([
                'name' => ['Label name is invalid.'],
            ]);
        }

        $slug = $this->uniqueLabelSlug($companyId, $slug);
        $maxSortOrder = (int) LeadLabel::query()->where('company_id', $companyId)->max('sort_order');

        return LeadLabel::query()->create([
            'company_id' => $companyId,
            'name' => (string) $payload['name'],
            'slug' => $slug,
            'color' => (string) ($payload['color'] ?? '#2563EB'),
            'sort_order' => $maxSortOrder + 1,
            'is_default' => false,
        ]);
    }

    public function updateLabel(User $user, int $labelId, array $payload): LeadLabel
    {
        $context = $this->companyContextService->resolve($user, $payload['company_id'] ?? null);
        $this->ensureCanManage((string) $context['role']);
        $companyId = (int) $context['company']->id;
        $this->ensureDefaultCrmSetup($companyId);

        $label = LeadLabel::query()
            ->where('company_id', $companyId)
            ->findOrFail($labelId);

        $nextName = isset($payload['name']) ? (string) $payload['name'] : $label->name;
        $nextColor = isset($payload['color']) ? (string) $payload['color'] : $label->color;

        $nextSlug = $label->slug;
        if (isset($payload['name']) && $nextName !== $label->name) {
            $baseSlug = Str::of($nextName)->slug('_')->toString();
            if ($baseSlug === '') {
                throw ValidationException::withMessages([
                    'name' => ['Label name is invalid.'],
                ]);
            }
            $nextSlug = $this->uniqueLabelSlug($companyId, $baseSlug, $label->id);
            Lead::query()
                ->where('company_id', $companyId)
                ->where('status', $label->slug)
                ->update(['status' => $nextSlug]);
        }

        $label->update([
            'name' => $nextName,
            'slug' => $nextSlug,
            'color' => $nextColor,
        ]);

        return $label->fresh();
    }

    public function reorderLabels(User $user, array $payload): Collection
    {
        $context = $this->companyContextService->resolve($user, $payload['company_id'] ?? null);
        $this->ensureCanManage((string) $context['role']);
        $companyId = (int) $context['company']->id;
        $this->ensureDefaultCrmSetup($companyId);

        $ids = collect($payload['ordered_label_ids'] ?? [])->map(static fn($id): int => (int) $id)->values();

        DB::transaction(function () use ($companyId, $ids): void {
            foreach ($ids as $index => $id) {
                LeadLabel::query()
                    ->where('company_id', $companyId)
                    ->where('id', $id)
                    ->update(['sort_order' => $index]);
            }
        });

        return $this->listLabels($user, $companyId);
    }

    /**
     * @return array{deleted_label_id:int,deleted_leads_count:int,reassigned_to_label_slug:string|null,reassigned_to_label_name:string|null}
     */
    public function deleteLabel(User $user, int $labelId, array $payload): array
    {
        $context = $this->companyContextService->resolve($user, $payload['company_id'] ?? null);
        $this->ensureCanManage((string) $context['role']);
        $companyId = (int) $context['company']->id;
        $this->ensureDefaultCrmSetup($companyId);

        $label = LeadLabel::query()
            ->where('company_id', $companyId)
            ->findOrFail($labelId);

        $assignedCount = Lead::query()
            ->where('company_id', $companyId)
            ->where('status', $label->slug)
            ->count();

        $fallbackLabel = LeadLabel::query()
            ->where('company_id', $companyId)
            ->where('id', '!=', $label->id)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->first();

        $forceDelete = (bool) ($payload['force'] ?? false);

        if ($assignedCount > 0 && ! $forceDelete) {
            throw ValidationException::withMessages([
                'label' => ["This label is currently assigned to {$assignedCount} leads. Confirm deletion to continue."],
                'label_usage_count' => [(string) $assignedCount],
            ]);
        }

        if ($assignedCount > 0 && ! $fallbackLabel) {
            throw ValidationException::withMessages([
                'label' => ['This label is in use and cannot be deleted because no fallback label is available. Create another label first.'],
            ]);
        }

        DB::transaction(function () use ($companyId, $label, $assignedCount, $fallbackLabel): void {
            if ($assignedCount > 0 && $fallbackLabel !== null) {
                Lead::query()
                    ->where('company_id', $companyId)
                    ->where('status', $label->slug)
                    ->update(['status' => $fallbackLabel->slug]);
            }

            $label->delete();
        });

        return [
            'deleted_label_id' => (int) $label->id,
            'deleted_leads_count' => (int) $assignedCount,
            'reassigned_to_label_slug' => $assignedCount > 0 ? $fallbackLabel?->slug : null,
            'reassigned_to_label_name' => $assignedCount > 0 ? $fallbackLabel?->name : null,
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     * @return array{imported_count:int,failed_rows:array<int,array<string,mixed>>}
     */
    public function importLeads(User $user, array $payload): array
    {
        $context = $this->companyContextService->resolve($user, $payload['company_id'] ?? null);
        $role = (string) $context['role'];
        $this->ensureCanCreateLeads($role);
        $companyId = (int) $context['company']->id;
        $this->ensureDefaultCrmSetup($companyId);

        $pipelineId = (int) ($payload['pipeline_id'] ?? 0);
        $this->assertPipelineInCompany($companyId, $pipelineId);

        $rows = collect($payload['rows'] ?? []);

        $importedCount = 0;
        $failedRows = [];

        foreach ($rows as $index => $row) {
            $validation = $this->validateImportRow($companyId, $row, $index + 1);

            if ($validation['errors'] !== []) {
                $failedRows[] = [
                    'row_index' => $index + 1,
                    'data' => $row,
                    'errors' => $validation['errors'],
                ];
                continue;
            }

            $data = $validation['normalized'];
            $normalizedSource = $data['source'];
            if ($role === 'agent' && $normalizedSource === null) {
                $normalizedSource = 'agent upload';
            }

            $this->create($user, [
                'company_id' => $companyId,
                'pipeline_id' => $pipelineId,
                'name' => $data['name'],
                'email' => $data['email'],
                'phone' => $data['phone'],
                'location' => $data['location'],
                'source' => $normalizedSource,
                'status' => $data['status'],
                'priority' => $data['priority'],
                'assigned_to_user_id' => $role === 'agent' ? (int) $user->id : null,
            ]);
            $importedCount++;
        }

        return [
            'imported_count' => $importedCount,
            'failed_rows' => $failedRows,
        ];
    }

    private function baseQuery(int $companyId): Builder
    {
        return Lead::query()
            ->where('company_id', $companyId)
            ->with([
                'pipeline:id,name,currency_code',
                'creator:id,name,email',
                'assignee:id,name,email',
                'notes' => fn($query) => $query->latest('id')->limit(10),
                'notes.creator:id,name,email',
                'activities' => fn($query) => $query->latest('id')->limit(20),
                'activities.creator:id,name,email',
            ]);
    }

    private function ensureCanManage(string $role): void
    {
        if (! in_array($role, ['owner', 'admin', 'supervisor'], true)) {
            throw ValidationException::withMessages([
                'authorization' => ['Only owners, admins, and supervisors can manage CRM leads.'],
            ]);
        }
    }

    private function ensureCanCreateLeads(string $role): void
    {
        if (! in_array($role, ['owner', 'admin', 'supervisor', 'agent'], true)) {
            throw ValidationException::withMessages([
                'authorization' => ['Only authenticated company members can create or import CRM leads.'],
            ]);
        }
    }

    private function assertLeadInCompany(Lead $lead, int $companyId): void
    {
        if ($lead->company_id !== $companyId) {
            throw ValidationException::withMessages([
                'lead' => ['The selected lead is outside your company context.'],
            ]);
        }
    }

    private function assertAgentCanAccessLead(Lead $lead, int $userId): void
    {
        if ((int) $lead->created_by_user_id !== $userId && (int) ($lead->assigned_to_user_id ?? 0) !== $userId) {
            throw ValidationException::withMessages([
                'authorization' => ['Agents can only access leads they created or are assigned to.'],
            ]);
        }
    }

    private function applyAgentLeadScope(Builder $query, int $userId): void
    {
        $query->where(function (Builder $builder) use ($userId): void {
            $builder->where('created_by_user_id', $userId)
                ->orWhere('assigned_to_user_id', $userId);
        });
    }

    private function assertMemberInCompany(int $companyId, int $userId, string $field): void
    {
        $memberExists = User::query()
            ->whereKey($userId)
            ->whereExists(function ($query) use ($companyId): void {
                $query->selectRaw('1')
                    ->from('company_users')
                    ->whereColumn('company_users.user_id', 'users.id')
                    ->where('company_users.company_id', $companyId);
            })
            ->exists();

        if (! $memberExists) {
            throw ValidationException::withMessages([
                $field => ['Selected user is not a member of this company.'],
            ]);
        }
    }

    private function assertPipelineInCompany(int $companyId, int $pipelineId): void
    {
        $exists = LeadPipeline::query()
            ->where('company_id', $companyId)
            ->whereKey($pipelineId)
            ->exists();

        if (! $exists) {
            throw ValidationException::withMessages([
                'pipeline_id' => ['The selected pipeline is outside your company context.'],
            ]);
        }
    }

    private function assertLabelExists(int $companyId, string $status): void
    {
        $exists = LeadLabel::query()
            ->where('company_id', $companyId)
            ->where('slug', $status)
            ->exists();

        if (! $exists) {
            throw ValidationException::withMessages([
                'status' => ['The selected label is not available in this company.'],
            ]);
        }
    }

    private function uniqueLabelSlug(int $companyId, string $baseSlug, ?int $ignoreLabelId = null): string
    {
        $slug = $baseSlug;
        $suffix = 1;

        while (LeadLabel::query()
            ->where('company_id', $companyId)
            ->where('slug', $slug)
            ->when($ignoreLabelId !== null, fn($query) => $query->where('id', '!=', $ignoreLabelId))
            ->exists()
        ) {
            $slug = $baseSlug . '_' . $suffix;
            $suffix++;
        }

        return $slug;
    }

    private function isAgentUploadSourceFilter(string $source): bool
    {
        $normalized = Str::of($source)
            ->replace(['-', '_'], ' ')
            ->trim()
            ->lower()
            ->value();

        return in_array($normalized, [
            'agent upload',
            'agent uploaded',
            'uploaded by agent',
            'uploaded by agents',
        ], true);
    }

    private function applyAgentUploadedSourceFilter(Builder $query): void
    {
        $accepted = [
            'agent upload',
            'agent uploaded',
            'uploaded by agent',
            'uploaded by agents',
        ];

        $quoted = implode(',', array_map(static fn(string $value): string => "'" . str_replace("'", "''", $value) . "'", $accepted));

        $query->whereRaw(
            "LOWER(TRIM(REPLACE(REPLACE(COALESCE(source, ''), '-', ' '), '_', ' '))) IN ($quoted)"
        );
    }

    private function ensureDefaultCrmSetup(int $companyId): void
    {
        $pipelineExists = LeadPipeline::query()->where('company_id', $companyId)->exists();
        if (! $pipelineExists) {
            LeadPipeline::query()->insert([
                [
                    'company_id' => $companyId,
                    'name' => 'Default Pipeline',
                    'currency_code' => 'USD',
                    'sort_order' => 0,
                    'is_default' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'company_id' => $companyId,
                    'name' => 'Sales Pipeline',
                    'currency_code' => 'USD',
                    'sort_order' => 1,
                    'is_default' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'company_id' => $companyId,
                    'name' => 'Marketing Pipeline',
                    'currency_code' => 'USD',
                    'sort_order' => 2,
                    'is_default' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            ]);
        }

        $labelExists = LeadLabel::query()->where('company_id', $companyId)->exists();
        if (! $labelExists) {
            LeadLabel::query()->insert([
                [
                    'company_id' => $companyId,
                    'name' => 'Newly Lead',
                    'slug' => 'newly_lead',
                    'color' => '#2563EB',
                    'sort_order' => 0,
                    'is_default' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'company_id' => $companyId,
                    'name' => 'Proposal Sent',
                    'slug' => 'proposal_sent',
                    'color' => '#F59E0B',
                    'sort_order' => 1,
                    'is_default' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'company_id' => $companyId,
                    'name' => 'Contacted',
                    'slug' => 'contacted',
                    'color' => '#E879A0',
                    'sort_order' => 2,
                    'is_default' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'company_id' => $companyId,
                    'name' => 'Qualified',
                    'slug' => 'qualified',
                    'color' => '#10B981',
                    'sort_order' => 3,
                    'is_default' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            ]);
        }

        $defaultPipeline = LeadPipeline::query()
            ->where('company_id', $companyId)
            ->orderByDesc('is_default')
            ->orderBy('sort_order')
            ->first();

        if ($defaultPipeline !== null) {
            Lead::query()
                ->where('company_id', $companyId)
                ->whereNull('pipeline_id')
                ->update(['pipeline_id' => $defaultPipeline->id]);
        }

        Lead::query()
            ->where('company_id', $companyId)
            ->where(function (Builder $builder): void {
                $builder->whereIn('status', ['new', ''])
                    ->orWhereNull('status');
            })
            ->update(['status' => 'newly_lead']);
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array{normalized:array<string,mixed>,errors:array<int,string>}
     */
    private function validateImportRow(int $companyId, mixed $row, int $rowIndex): array
    {
        if (! is_array($row)) {
            return [
                'normalized' => [],
                'errors' => ['Row must be an object-like payload.'],
            ];
        }

        $name = trim((string) ($row['name'] ?? ''));
        $email = trim((string) ($row['email'] ?? ''));
        $phone = trim((string) ($row['phone'] ?? ''));
        $location = trim((string) ($row['location'] ?? ''));
        $source = trim((string) ($row['source'] ?? ''));
        $status = trim((string) ($row['status'] ?? 'newly_lead'));
        $priority = trim((string) ($row['priority'] ?? 'medium'));

        $errors = [];

        if ($name === '') {
            $errors[] = 'Name is required.';
        }

        if ($email !== '' && ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors[] = 'Email is invalid.';
        }

        if (! in_array($priority, ['low', 'medium', 'high', 'urgent'], true)) {
            $errors[] = 'Priority must be one of low, medium, high, urgent.';
        }

        if (! LeadLabel::query()->where('company_id', $companyId)->where('slug', $status)->exists()) {
            $errors[] = 'Status/label is not recognized.';
        }

        return [
            'normalized' => [
                'name' => $name,
                'email' => $email !== '' ? $email : null,
                'phone' => $phone !== '' ? $phone : null,
                'location' => $location !== '' ? $location : null,
                'source' => $source !== '' ? $source : null,
                'status' => $status,
                'priority' => $priority,
                'row_index' => $rowIndex,
            ],
            'errors' => $errors,
        ];
    }

    private function notifyLeadRecipients(
        Lead $lead,
        User $actor,
        string $type,
        string $title,
        string $message,
        string $priority,
    ): void {
        $recipientIds = collect([
            (int) $lead->created_by_user_id,
            (int) ($lead->assigned_to_user_id ?? 0),
        ])
            ->merge(
                DB::table('company_users')
                    ->where('company_id', $lead->company_id)
                    ->whereIn('role', ['owner', 'admin', 'supervisor'])
                    ->pluck('user_id')
                    ->map(static fn(mixed $id): int => (int) $id)
                    ->all(),
            )
            ->filter(static fn(int $id): bool => $id > 0)
            ->unique()
            ->reject(static fn(int $id): bool => $id === (int) $actor->id)
            ->values()
            ->all();

        foreach ($recipientIds as $recipientId) {
            $this->notificationService->notifyUser($recipientId, [
                'company_id' => (int) $lead->company_id,
                'type' => $type,
                'category' => NotificationCategory::CRM->value,
                'title' => $title,
                'message' => $message,
                'reference_type' => Lead::class,
                'reference_id' => (int) $lead->id,
                'action_url' => '/crm/leads/' . $lead->id,
                'action_route' => 'crm.leads.show',
                'priority' => $priority,
                'created_by_user_id' => (int) $actor->id,
                'metadata' => [
                    'lead_id' => (int) $lead->id,
                    'lead_status' => $lead->status,
                    'actor_user_id' => (int) $actor->id,
                ],
                'dedupe_key' => $type . ':' . $lead->id . ':' . $recipientId,
            ]);
        }
    }
}
