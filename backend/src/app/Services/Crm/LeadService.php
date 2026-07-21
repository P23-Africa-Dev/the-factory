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
use App\Support\LeadFieldNormalizer;
use Carbon\CarbonInterface;
use Illuminate\Contracts\Pagination\Paginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Common\Entity\Style\Style;
use OpenSpout\Writer\XLSX\Writer as XlsxWriter;

class LeadService
{
    private const LEAD_EXPORT_HEADERS = [
        'Name',
        'Email',
        'Phone',
        'Location',
        'Company Name',
        'Website',
        'Position',
        'Profile URLs',
        'Source',
        'Status',
        'Priority',
        'Budget Amount',
        'Budget Currency',
        'Pipeline',
        'Assigned To',
        'Created At',
        'Updated At',
    ];

    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly NotificationService $notificationService,
        private readonly MapSavedLeadBridgeService $mapSavedLeadBridgeService,
    ) {}

    public function listForUser(User $user, array $filters): Paginator
    {
        $context = $this->companyContextService->resolve($user, $filters['company_id'] ?? null);
        $companyId = (int) $context['company']->id;
        $role = (string) $context['role'];
        $this->ensureDefaultCrmSetup($companyId);

        $query = $this->baseQuery($companyId);
        $this->applyLeadListFilters($query, $user, $role, $filters);

        $perPage = max(1, min((int) ($filters['per_page'] ?? 20), 100));

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

        $source = $this->normalizeLeadSource(
            array_key_exists('source', $data) ? ($data['source'] !== null ? (string) $data['source'] : null) : null,
            $role,
        );

        $lead = Lead::create([
            'company_id' => $companyId,
            'pipeline_id' => $pipelineId,
            'company_location_id' => isset($data['company_location_id']) ? (int) $data['company_location_id'] : null,
            'created_by_user_id' => $user->id,
            'assigned_to_user_id' => $assignedToUserId,
            'name' => $data['name'],
            'email' => $data['email'] ?? null,
            'phone' => $data['phone'] ?? null,
            'location' => $data['location'] ?? null,
            'company_name' => $data['company_name'] ?? null,
            'website' => isset($data['website']) ? LeadFieldNormalizer::normalizeWebsite((string) $data['website']) : null,
            'position' => $data['position'] ?? null,
            'profile_urls' => ! empty($data['profile_urls']) ? LeadFieldNormalizer::normalizeProfileUrls($data['profile_urls']) : null,
            'source' => $source,
            'status' => $data['status'],
            'priority' => $data['priority'],
            'budget_amount' => $data['budget_amount'] ?? null,
            'budget_currency' => isset($data['budget_currency']) && $data['budget_currency'] !== ''
                ? strtoupper((string) $data['budget_currency'])
                : null,
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
            'company_name' => array_key_exists('company_name', $data) ? $data['company_name'] : $lead->company_name,
            'website' => array_key_exists('website', $data)
                ? ($data['website'] !== null ? LeadFieldNormalizer::normalizeWebsite((string) $data['website']) : null)
                : $lead->website,
            'position' => array_key_exists('position', $data) ? $data['position'] : $lead->position,
            'profile_urls' => array_key_exists('profile_urls', $data)
                ? (! empty($data['profile_urls']) ? LeadFieldNormalizer::normalizeProfileUrls($data['profile_urls']) : null)
                : $lead->profile_urls,
            'source' => array_key_exists('source', $data) ? $data['source'] : $lead->source,
            'status' => $data['status'] ?? $lead->status,
            'priority' => $data['priority'] ?? $lead->priority,
            'budget_amount' => array_key_exists('budget_amount', $data) ? $data['budget_amount'] : $lead->budget_amount,
            'budget_currency' => array_key_exists('budget_currency', $data)
                ? ($data['budget_currency'] !== null ? strtoupper((string) $data['budget_currency']) : null)
                : $lead->budget_currency,
            'next_action' => array_key_exists('next_action', $data) ? $data['next_action'] : $lead->next_action,
            'last_interaction' => array_key_exists('last_interaction', $data) ? $data['last_interaction'] : $lead->last_interaction,
            'last_interaction_at' => array_key_exists('last_interaction_at', $data) ? $data['last_interaction_at'] : $lead->last_interaction_at,
            'meta' => array_key_exists('meta', $data) ? $data['meta'] : $lead->meta,
            'converted_at' => array_key_exists('converted_at', $data) ? $data['converted_at'] : $lead->converted_at,
        ]);

        $lead = $lead->fresh();

        if ($lead->company_location_id !== null) {
            $this->mapSavedLeadBridgeService->syncLeadToLocation($lead);
        }

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

    public function delete(User $user, Lead $lead, ?int $companyId = null): void
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $role = (string) $context['role'];
        $resolvedCompanyId = (int) $context['company']->id;
        $this->ensureDefaultCrmSetup($resolvedCompanyId);
        $this->assertLeadInCompany($lead, $resolvedCompanyId);
        $this->ensureCanManage($role);

        $this->mapSavedLeadBridgeService->unlinkLeadFromLocation($lead);
        $lead->update(['company_location_id' => null]);
        $lead->delete();
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
            $baseQuery->where('created_by_user_id', (int) $user->id);
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
                    'avatar_url' => AvatarUrlResolver::resolveOrDefault($agent->avatar, $agent->gender),
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
                    'avatar_url' => AvatarUrlResolver::resolveOrDefault($fallbackAgent->avatar, $fallbackAgent->gender),
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
                        'avatar_url' => AvatarUrlResolver::resolveOrDefault($lead->creator->avatar, $lead->creator->gender),
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

    /**
     * @param array<string,mixed> $filters
     * @return array{
     *     total_leads: int,
     *     week_growth_percent: int,
     *     week_growth_direction: string,
     *     daily_trend: array<int, array{day: string, value: int, date: string}>,
     *     month_new_leads: int,
     *     month_label: string,
     *     highlight_day: string|null
     * }
     */
    public function leadsAnalytics(User $user, ?int $companyId = null, array $filters = []): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $role = (string) $context['role'];
        $this->ensureDefaultCrmSetup($resolvedCompanyId);

        $query = Lead::query()->where('company_id', $resolvedCompanyId);
        $this->applyLeadListFilters($query, $user, $role, $filters);

        $totalLeads = (int) (clone $query)->count();

        $currentWeekStart = now()->startOfWeek(CarbonInterface::MONDAY)->startOfDay();
        $currentWeekEnd = now()->endOfWeek(CarbonInterface::SUNDAY)->endOfDay();
        $previousWeekStart = $currentWeekStart->copy()->subWeek();
        $previousWeekEnd = $currentWeekEnd->copy()->subWeek();

        $currentWeekCreated = (int) (clone $query)
            ->whereBetween('created_at', [$currentWeekStart, $currentWeekEnd])
            ->count();
        $previousWeekCreated = (int) (clone $query)
            ->whereBetween('created_at', [$previousWeekStart, $previousWeekEnd])
            ->count();

        if ($previousWeekCreated > 0) {
            $weekGrowthPercent = (int) round((($currentWeekCreated - $previousWeekCreated) / $previousWeekCreated) * 100);
        } elseif ($currentWeekCreated > 0) {
            $weekGrowthPercent = 100;
        } else {
            $weekGrowthPercent = 0;
        }

        $weekGrowthDirection = match (true) {
            $weekGrowthPercent > 0 => 'up',
            $weekGrowthPercent < 0 => 'down',
            default => 'flat',
        };

        $weekdayLabels = [
            1 => 'Mon',
            2 => 'Tues',
            3 => 'Weds',
            4 => 'Thurs',
            5 => 'Fri',
            6 => 'Sat',
        ];

        $dailyTrend = [];
        $highlightDay = null;
        $highlightValue = -1;

        for ($offset = 0; $offset < 6; $offset++) {
            $day = $currentWeekStart->copy()->addDays($offset);
            $dayStart = $day->copy()->startOfDay();
            $dayEnd = $day->copy()->endOfDay();
            $value = $day->isFuture()
                ? 0
                : (int) (clone $query)->whereBetween('created_at', [$dayStart, $dayEnd])->count();
            $label = $weekdayLabels[$day->dayOfWeek] ?? $day->format('D');

            $dailyTrend[] = [
                'day' => $label,
                'value' => $value,
                'date' => $day->toDateString(),
            ];

            if ($value > $highlightValue) {
                $highlightValue = $value;
                $highlightDay = $label;
            }
        }

        $monthStart = now()->startOfMonth()->startOfDay();
        $monthNewLeads = (int) (clone $query)
            ->where('created_at', '>=', $monthStart)
            ->count();

        return [
            'total_leads' => $totalLeads,
            'week_growth_percent' => $weekGrowthPercent,
            'week_growth_direction' => $weekGrowthDirection,
            'daily_trend' => $dailyTrend,
            'month_new_leads' => $monthNewLeads,
            'month_label' => now()->format('F'),
            'highlight_day' => $highlightDay,
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
            ->get()
            ->filter(function (LeadPipeline $pipeline) use ($resolvedCompanyId): bool {
                if ($pipeline->system_key === MapSavedLeadBridgeService::MAP_PIPELINE_SYSTEM_KEY) {
                    return $this->mapSavedLeadBridgeService->mapPipelineHasLeads($resolvedCompanyId);
                }

                return true;
            })
            ->values();
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

    /**
     * @return array{deleted_pipeline_id:int,reassigned_leads_count:int,reassigned_to_pipeline_id:int|null,reassigned_to_pipeline_name:string|null}
     */
    public function deletePipeline(User $user, int $pipelineId, array $payload): array
    {
        $context = $this->companyContextService->resolve($user, $payload['company_id'] ?? null);
        $this->ensureCanManage((string) $context['role']);
        $companyId = (int) $context['company']->id;
        $this->ensureDefaultCrmSetup($companyId);

        $pipeline = LeadPipeline::query()
            ->where('company_id', $companyId)
            ->findOrFail($pipelineId);

        if ($pipeline->is_default) {
            throw ValidationException::withMessages([
                'pipeline' => ['The default pipeline cannot be deleted.'],
            ]);
        }

        if ($pipeline->system_key === MapSavedLeadBridgeService::MAP_PIPELINE_SYSTEM_KEY) {
            throw ValidationException::withMessages([
                'pipeline' => ['System pipelines cannot be deleted.'],
            ]);
        }

        $assignedCount = Lead::query()
            ->where('company_id', $companyId)
            ->where('pipeline_id', $pipeline->id)
            ->count();

        $fallbackPipeline = LeadPipeline::query()
            ->where('company_id', $companyId)
            ->where('id', '!=', $pipeline->id)
            ->where(function ($query): void {
                $query->whereNull('system_key')
                    ->orWhere('system_key', '!=', MapSavedLeadBridgeService::MAP_PIPELINE_SYSTEM_KEY);
            })
            ->orderByDesc('is_default')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->first();

        if ($fallbackPipeline === null) {
            throw ValidationException::withMessages([
                'pipeline' => ['This pipeline cannot be deleted because no fallback pipeline is available.'],
            ]);
        }

        $forceDelete = (bool) ($payload['force'] ?? false);

        if ($assignedCount > 0 && ! $forceDelete) {
            throw ValidationException::withMessages([
                'pipeline' => ["This pipeline currently has {$assignedCount} leads. Confirm deletion to continue."],
                'pipeline_usage_count' => [(string) $assignedCount],
            ]);
        }

        DB::transaction(function () use ($companyId, $pipeline, $assignedCount, $fallbackPipeline): void {
            if ($assignedCount > 0) {
                Lead::query()
                    ->where('company_id', $companyId)
                    ->where('pipeline_id', $pipeline->id)
                    ->update(['pipeline_id' => $fallbackPipeline->id]);
            }

            $pipeline->delete();
        });

        return [
            'deleted_pipeline_id' => (int) $pipeline->id,
            'reassigned_leads_count' => (int) $assignedCount,
            'reassigned_to_pipeline_id' => $assignedCount > 0 ? (int) $fallbackPipeline->id : null,
            'reassigned_to_pipeline_name' => $assignedCount > 0 ? $fallbackPipeline->name : null,
        ];
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
     * @return array{imported_count:int,updated_count:int,skipped_count:int,failed_rows:array<int,array<string,mixed>>,skipped_rows:array<int,array<string,mixed>>}
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

        $duplicatePolicy = (string) ($payload['duplicate_policy'] ?? 'create');
        $labelLookup = $this->buildLabelLookup($companyId);
        $rows = collect($payload['rows'] ?? []);

        $importedCount = 0;
        $updatedCount = 0;
        $failedRows = [];
        $skippedRows = [];

        foreach ($rows as $index => $row) {
            $validation = $this->validateImportRow($labelLookup, $row, $index + 1);

            if ($validation['errors'] !== []) {
                $failedRows[] = [
                    'row_index' => $index + 1,
                    'data' => $row,
                    'errors' => $validation['errors'],
                ];
                continue;
            }

            $data = $validation['normalized'];

            $duplicate = $duplicatePolicy === 'create'
                ? null
                : $this->resolveDuplicateLead($companyId, $data['email'], $data['phone']);

            if ($duplicate !== null && $duplicatePolicy === 'skip') {
                $skippedRows[] = [
                    'row_index' => $index + 1,
                    'data' => $row,
                    'reason' => "A lead with the same email or phone already exists ('{$duplicate->name}').",
                ];
                continue;
            }

            if ($duplicate !== null && $duplicatePolicy === 'update') {
                if ($role === 'agent'
                    && (int) $duplicate->created_by_user_id !== (int) $user->id
                    && (int) ($duplicate->assigned_to_user_id ?? 0) !== (int) $user->id
                ) {
                    $skippedRows[] = [
                        'row_index' => $index + 1,
                        'data' => $row,
                        'reason' => "A matching lead exists ('{$duplicate->name}') but is not assigned to you, so it was not updated.",
                    ];
                    continue;
                }

                $duplicate->update($this->buildDuplicateUpdatePayload($duplicate, $row, $data, $pipelineId));
                $updatedCount++;
                continue;
            }

            $normalizedSource = $data['source'];
            if ($role === 'agent' && $normalizedSource === null) {
                $normalizedSource = 'agent_upload';
            }

            $this->create($user, [
                'company_id' => $companyId,
                'pipeline_id' => $pipelineId,
                'name' => $data['name'],
                'email' => $data['email'],
                'phone' => $data['phone'],
                'location' => $data['location'],
                'company_name' => $data['company_name'] ?? null,
                'website' => $data['website'] ?? null,
                'position' => $data['position'] ?? null,
                'profile_urls' => $data['profile_urls'] ?? null,
                'source' => $normalizedSource,
                'status' => $data['status'],
                'priority' => $data['priority'],
                'budget_amount' => $data['budget_amount'] ?? null,
                'budget_currency' => $data['budget_currency'] ?? null,
                'assigned_to_user_id' => $role === 'agent' ? (int) $user->id : null,
            ]);
            $importedCount++;
        }

        return [
            'imported_count' => $importedCount,
            'updated_count' => $updatedCount,
            'skipped_count' => count($skippedRows),
            'failed_rows' => $failedRows,
            'skipped_rows' => $skippedRows,
        ];
    }

    /**
     * Dry-run import validation: reports readiness without writing any leads.
     *
     * @param  array<string, mixed>  $payload
     * @return array{total_rows:int,valid_count:int,duplicate_count:int,error_rows:array<int,array<string,mixed>>,duplicate_rows:array<int,array<string,mixed>>}
     */
    public function previewImportLeads(User $user, array $payload): array
    {
        $context = $this->companyContextService->resolve($user, $payload['company_id'] ?? null);
        $role = (string) $context['role'];
        $this->ensureCanCreateLeads($role);
        $companyId = (int) $context['company']->id;
        $this->ensureDefaultCrmSetup($companyId);

        $pipelineId = (int) ($payload['pipeline_id'] ?? 0);
        $this->assertPipelineInCompany($companyId, $pipelineId);

        $labelLookup = $this->buildLabelLookup($companyId);
        $rows = collect($payload['rows'] ?? []);

        $validCount = 0;
        $errorRows = [];
        $duplicateRows = [];

        foreach ($rows as $index => $row) {
            $validation = $this->validateImportRow($labelLookup, $row, $index + 1);

            if ($validation['errors'] !== []) {
                $errorRows[] = [
                    'row_index' => $index + 1,
                    'data' => $row,
                    'errors' => $validation['errors'],
                ];
                continue;
            }

            $data = $validation['normalized'];
            $duplicate = $this->resolveDuplicateLead($companyId, $data['email'], $data['phone']);

            if ($duplicate !== null) {
                $duplicateRows[] = [
                    'row_index' => $index + 1,
                    'data' => $row,
                    'existing_lead_id' => (int) $duplicate->id,
                    'existing_lead_name' => (string) $duplicate->name,
                ];
                continue;
            }

            $validCount++;
        }

        return [
            'total_rows' => $rows->count(),
            'valid_count' => $validCount,
            'duplicate_count' => count($duplicateRows),
            'error_rows' => $errorRows,
            'duplicate_rows' => $duplicateRows,
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array{filename:string,content_type:string,stream:callable}
     */
    public function exportLeads(User $user, array $filters): array
    {
        $context = $this->companyContextService->resolve($user, $filters['company_id'] ?? null);
        $role = (string) $context['role'];
        $companyId = (int) $context['company']->id;
        $this->ensureDefaultCrmSetup($companyId);

        $format = strtolower((string) ($filters['format'] ?? 'csv'));
        $filename = sprintf('crm-leads-export-%s.%s', now()->format('Y-m-d'), $format === 'xlsx' ? 'xlsx' : 'csv');

        if ($format === 'xlsx') {
            return [
                'filename' => $filename,
                'content_type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'stream' => function () use ($companyId, $user, $role, $filters): void {
                    $this->streamLeadsXlsxExport($companyId, $user, $role, $filters);
                },
            ];
        }

        return [
            'filename' => $filename,
            'content_type' => 'text/csv; charset=UTF-8',
            'stream' => function () use ($companyId, $user, $role, $filters): void {
                $this->streamLeadsCsvExport($companyId, $user, $role, $filters);
            },
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

    /**
     * @param array<string,mixed> $filters
     */
    private function applyLeadListFilters(Builder $query, User $user, string $role, array $filters): void
    {
        if ($role === 'agent') {
            $source = isset($filters['source']) ? (string) $filters['source'] : '';
            if ($source !== '' && $this->isAgentUploadSourceFilter($source)) {
                $query->where('created_by_user_id', (int) $user->id);
            } else {
                $this->applyAgentLeadScope($query, (int) $user->id);
            }
        }

        if (! empty($filters['status'])) {
            $query->where('status', (string) $filters['status']);
        }

        if (! empty($filters['uncategorized'])) {
            $query->whereNotExists(function ($subquery): void {
                $subquery->selectRaw('1')
                    ->from('lead_labels')
                    ->whereColumn('lead_labels.company_id', 'leads.company_id')
                    ->whereColumn('lead_labels.slug', 'leads.status');
            });
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
                    ->orWhere('location', 'like', '%' . $search . '%')
                    ->orWhere('company_name', 'like', '%' . $search . '%')
                    ->orWhere('source', 'like', '%' . $search . '%');
            });
        }
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
                    'name' => 'New Lead',
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
     * Lookup of lowercase label slugs AND display names to their canonical slug,
     * so import rows can reference a status either way (e.g. "New Lead" or "newly_lead").
     *
     * @return array<string, string>
     */
    private function buildLabelLookup(int $companyId): array
    {
        $lookup = [];

        foreach (LeadLabel::query()->where('company_id', $companyId)->get(['slug', 'name']) as $label) {
            $lookup[Str::lower(trim((string) $label->slug))] = (string) $label->slug;
            $lookup[Str::lower(trim((string) $label->name))] = (string) $label->slug;
        }

        return $lookup;
    }

    /**
     * @param  array<string, string>  $labelLookup
     */
    private function suggestClosestLabel(array $labelLookup, string $status): ?string
    {
        $needle = Str::lower(trim($status));
        $bestKey = null;
        $bestDistance = PHP_INT_MAX;

        foreach (array_keys($labelLookup) as $candidate) {
            $distance = levenshtein($needle, $candidate);
            if ($distance < $bestDistance) {
                $bestDistance = $distance;
                $bestKey = $candidate;
            }
        }

        return ($bestKey !== null && $bestDistance <= 4) ? $labelLookup[$bestKey] : null;
    }

    private function normalizePhoneDigits(?string $phone): ?string
    {
        if ($phone === null) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', $phone) ?? '';

        return $digits !== '' ? $digits : null;
    }

    /**
     * Find an existing company lead matching by email (preferred) or phone.
     */
    private function resolveDuplicateLead(int $companyId, ?string $email, ?string $phone): ?Lead
    {
        $normalizedEmail = $email !== null ? Str::lower(trim($email)) : null;

        if ($normalizedEmail !== null && $normalizedEmail !== '') {
            $match = Lead::query()
                ->where('company_id', $companyId)
                ->whereRaw('LOWER(email) = ?', [$normalizedEmail])
                ->orderBy('id')
                ->first();

            if ($match !== null) {
                return $match;
            }
        }

        $phoneDigits = $this->normalizePhoneDigits($phone);
        if ($phoneDigits === null) {
            return null;
        }

        $strippedPhoneSql = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', '')";

        return Lead::query()
            ->where('company_id', $companyId)
            ->whereRaw("$strippedPhoneSql = ?", [$phoneDigits])
            ->orderBy('id')
            ->first();
    }

    /**
     * Build the update payload for a duplicate match: only fields the import row
     * actually provided are applied, so existing values are never wiped by blanks.
     *
     * @param  array<string, mixed>  $row
     * @param  array<string, mixed>  $normalized
     * @return array<string, mixed>
     */
    private function buildDuplicateUpdatePayload(
        Lead $existing,
        array $row,
        array $normalized,
        int $targetPipelineId,
    ): array
    {
        // "Target Pipeline" applies to both newly created and updated rows.
        $update = ['pipeline_id' => $targetPipelineId];
        $provided = static fn(string $key): bool => trim((string) ($row[$key] ?? '')) !== '';

        foreach (['name', 'email', 'phone', 'location', 'company_name', 'website', 'position', 'source'] as $field) {
            if ($provided($field) && $normalized[$field] !== null) {
                $update[$field] = $normalized[$field];
            }
        }

        if ($provided('profile_urls') || (is_array($row['profile_urls'] ?? null) && ($row['profile_urls'] ?? []) !== [])) {
            if (! empty($normalized['profile_urls'])) {
                $update['profile_urls'] = $normalized['profile_urls'];
            }
        }

        if ($provided('status')) {
            $update['status'] = $normalized['status'];
        }

        if ($provided('priority')) {
            $update['priority'] = $normalized['priority'];
        }

        if ($provided('budget_amount') && $normalized['budget_amount'] !== null) {
            $update['budget_amount'] = $normalized['budget_amount'];
            $update['budget_currency'] = $normalized['budget_currency'] ?? $existing->budget_currency;
        }

        return $update;
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    private function streamLeadsCsvExport(int $companyId, User $user, string $role, array $filters): void
    {
        $out = fopen('php://output', 'wb');
        if (! is_resource($out)) {
            return;
        }

        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, self::LEAD_EXPORT_HEADERS);

        $this->streamLeadExportRows($companyId, $user, $role, $filters, static function (array $row) use ($out): void {
            fputcsv($out, $row);
        });

        fclose($out);
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    private function streamLeadsXlsxExport(int $companyId, User $user, string $role, array $filters): void
    {
        if (! extension_loaded('zip') || ! class_exists(\ZipArchive::class)) {
            Log::error('CRM leads XLSX export failed: zip extension missing.', [
                'company_id' => $companyId,
                'actor_user_id' => (int) $user->id,
            ]);

            throw ValidationException::withMessages([
                'export' => ['XLSX export is unavailable because the server zip extension is not enabled.'],
            ]);
        }

        $exportDir = storage_path('app/exports');
        if (! is_dir($exportDir)) {
            @mkdir($exportDir, 0775, true);
        }

        if (! is_dir($exportDir) || ! is_writable($exportDir)) {
            throw ValidationException::withMessages([
                'export' => ['XLSX export failed because the export temp directory is not writable.'],
            ]);
        }

        $tmpFile = tempnam($exportDir, 'crm-leads-export-');
        if ($tmpFile === false) {
            throw ValidationException::withMessages([
                'export' => ['Unable to prepare export file. Please try again.'],
            ]);
        }

        $writer = null;

        try {
            $writer = new XlsxWriter();
            $writer->openToFile($tmpFile);
            $writer->setCreator('Factory23 CRM');

            $sheet = $writer->getCurrentSheet();
            $sheet->setName('Leads Export');

            $headerStyle = (new Style())->setFontBold();
            $columnStyles = [];
            foreach (array_keys(self::LEAD_EXPORT_HEADERS) as $index) {
                $columnStyles[$index] = $headerStyle;
            }

            $writer->addRow(Row::fromValuesWithStyles(self::LEAD_EXPORT_HEADERS, null, $columnStyles));

            $this->streamLeadExportRows($companyId, $user, $role, $filters, static function (array $row) use ($writer): void {
                $writer->addRow(Row::fromValues($row));
            });

            $writer->close();

            $reader = fopen($tmpFile, 'rb');
            if (is_resource($reader)) {
                fpassthru($reader);
                fclose($reader);
            }
        } catch (\Throwable $exception) {
            Log::error('CRM leads XLSX export failed.', [
                'company_id' => $companyId,
                'actor_user_id' => (int) $user->id,
                'exception_class' => $exception::class,
                'exception_message' => $exception->getMessage(),
            ]);

            throw ValidationException::withMessages([
                'export' => ['Unable to generate the Excel export file.'],
            ]);
        } finally {
            if ($writer instanceof XlsxWriter) {
                try {
                    $writer->close();
                } catch (\Throwable) {
                    // ignore close failures during cleanup
                }
            }

            if (is_file($tmpFile)) {
                @unlink($tmpFile);
            }
        }
    }

    /**
     * @param  array<string, mixed>  $filters
     * @param  callable(array<int, mixed>): void  $emit
     */
    private function streamLeadExportRows(int $companyId, User $user, string $role, array $filters, callable $emit): void
    {
        $labelNames = LeadLabel::query()
            ->where('company_id', $companyId)
            ->pluck('name', 'slug')
            ->all();

        $query = Lead::query()
            ->where('company_id', $companyId)
            ->with(['pipeline:id,name', 'assignee:id,name,email']);

        $this->applyLeadListFilters($query, $user, $role, $filters);

        if (! empty($filters['lead_ids'])) {
            $leadIds = array_map(static fn($id): int => (int) $id, (array) $filters['lead_ids']);
            $query->whereIn('id', $leadIds);
        }

        $query->orderBy('id')->chunkById(250, static function (Collection $leads) use ($labelNames, $emit): void {
            foreach ($leads as $lead) {
                $emit([
                    (string) $lead->name,
                    (string) ($lead->email ?? ''),
                    (string) ($lead->phone ?? ''),
                    (string) ($lead->location ?? ''),
                    (string) ($lead->company_name ?? ''),
                    (string) ($lead->website ?? ''),
                    (string) ($lead->position ?? ''),
                    implode(', ', is_array($lead->profile_urls) ? $lead->profile_urls : []),
                    (string) ($lead->source ?? ''),
                    (string) ($labelNames[$lead->status] ?? $lead->status ?? ''),
                    (string) ($lead->priority?->value ?? ''),
                    $lead->budget_amount !== null ? (string) $lead->budget_amount : '',
                    (string) ($lead->budget_currency ?? ''),
                    (string) ($lead->pipeline?->name ?? ''),
                    (string) ($lead->assignee?->name ?? $lead->assignee?->email ?? ''),
                    $lead->created_at?->toIso8601String() ?? '',
                    $lead->updated_at?->toIso8601String() ?? '',
                ]);
            }
        });
    }

    /**
     * @param  array<string, string>  $labelLookup
     * @return array{normalized:array<string,mixed>,errors:array<int,string>}
     */
    private function validateImportRow(array $labelLookup, mixed $row, int $rowIndex): array
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
        $companyName = trim((string) ($row['company_name'] ?? ''));
        $websiteRaw = trim((string) ($row['website'] ?? ''));
        $position = trim((string) ($row['position'] ?? ''));
        $profileUrlsRaw = $row['profile_urls'] ?? null;
        $source = trim((string) ($row['source'] ?? ''));
        $status = trim((string) ($row['status'] ?? 'newly_lead'));
        $priority = strtolower(trim((string) ($row['priority'] ?? 'medium')));
        $budgetAmountRaw = trim((string) ($row['budget_amount'] ?? ''));
        $budgetCurrency = strtoupper(trim((string) ($row['budget_currency'] ?? '')));

        $errors = [];

        if ($name === '') {
            $errors[] = 'Name is required.';
        }

        if ($email !== '' && ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors[] = 'Email is invalid.';
        }

        $website = $websiteRaw !== '' ? LeadFieldNormalizer::normalizeWebsite($websiteRaw) : null;
        if ($websiteRaw !== '' && ! LeadFieldNormalizer::isValidWebsite($website)) {
            $errors[] = 'Website is invalid.';
        }

        $profileUrls = LeadFieldNormalizer::normalizeProfileUrls($profileUrlsRaw);
        $invalidProfileUrls = LeadFieldNormalizer::invalidProfileUrls($profileUrls);
        if ($invalidProfileUrls !== []) {
            $errors[] = 'Profile URLs contain invalid entries: ' . implode(', ', $invalidProfileUrls) . '.';
        }

        if (! in_array($priority, ['low', 'medium', 'high', 'urgent'], true)) {
            $errors[] = 'Priority must be one of low, medium, high, urgent.';
        }

        $budgetAmount = null;
        if ($budgetAmountRaw !== '') {
            if (! is_numeric(str_replace(',', '', $budgetAmountRaw))) {
                $errors[] = 'Budget amount must be numeric.';
            } else {
                $budgetAmount = (float) str_replace(',', '', $budgetAmountRaw);
                if ($budgetAmount < 0) {
                    $errors[] = 'Budget amount must be zero or greater.';
                }
            }
        }

        if ($budgetCurrency !== '' && ! preg_match('/^[A-Z]{3}$/', $budgetCurrency)) {
            $errors[] = 'Budget currency must be a 3-letter ISO code.';
        }

        $resolvedStatus = $labelLookup[Str::lower($status)] ?? null;
        if ($resolvedStatus === null) {
            $suggestion = $this->suggestClosestLabel($labelLookup, $status);
            $errors[] = $suggestion !== null
                ? "Status/label '{$status}' is not recognized. Did you mean '{$suggestion}'?"
                : "Status/label '{$status}' is not recognized.";
        }

        return [
            'normalized' => [
                'name' => $name,
                'email' => $email !== '' ? $email : null,
                'phone' => $phone !== '' ? $phone : null,
                'location' => $location !== '' ? $location : null,
                'company_name' => $companyName !== '' ? $companyName : null,
                'website' => $website,
                'position' => $position !== '' ? $position : null,
                'profile_urls' => $profileUrls !== [] ? $profileUrls : null,
                'source' => $source !== '' ? $source : null,
                'status' => $resolvedStatus ?? $status,
                'priority' => $priority,
                'budget_amount' => $budgetAmount,
                'budget_currency' => $budgetCurrency !== '' ? $budgetCurrency : ($budgetAmount !== null ? 'USD' : null),
                'row_index' => $rowIndex,
            ],
            'errors' => $errors,
        ];
    }

    private function normalizeLeadSource(?string $source, string $role): ?string
    {
        if ($source === null || trim($source) === '') {
            return $role === 'agent' ? 'agent_upload' : null;
        }

        $normalized = Str::of($source)
            ->replace(['-', '_'], ' ')
            ->trim()
            ->lower()
            ->value();

        if (in_array($normalized, [
            'agent upload',
            'agent uploaded',
            'uploaded by agent',
            'uploaded by agents',
        ], true)) {
            return 'agent_upload';
        }

        return trim($source);
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
