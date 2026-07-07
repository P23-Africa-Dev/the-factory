<?php

declare(strict_types=1);

namespace App\Services\AI\Crm;

use App\Enums\LeadPriority;
use App\Enums\LeadStatus;
use App\Models\Lead;
use App\Models\User;
use App\Services\AI\Support\ReadListPresenter;
use App\Services\Company\CompanyContextService;
use Illuminate\Database\Eloquent\Builder;

class CrmIntelligenceService
{
    private const STALE_DAYS = 14;

    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly ReadListPresenter $readListPresenter,
    ) {}

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    public function followUpSummary(User $user, int $companyId, array $args = []): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $role = (string) $context['role'];
        $limit = max(1, min($this->readListPresenter->maxExpandedLimit('crm.follow_up_summary'), (int) ($args['limit'] ?? $this->readListPresenter->previewLimit())));
        $countOnly = ($args['count_only'] ?? false) === true;

        $query = Lead::query()
            ->where('company_id', $resolvedCompanyId)
            ->whereNull('converted_at')
            ->whereNotIn('status', [LeadStatus::WON->value, LeadStatus::LOST->value])
            ->orderByRaw("case priority when 'urgent' then 4 when 'high' then 3 when 'medium' then 2 else 1 end desc")
            ->orderBy('last_interaction_at');

        if ($role === 'agent') {
            $this->applyAgentLeadScope($query, (int) $user->id);
        }

        $total = (int) (clone $query)->count();

        $items = (clone $query)
            ->limit($limit)
            ->get()
            ->map(function (Lead $lead): array {
                $daysSince = $lead->last_interaction_at !== null
                    ? (int) $lead->last_interaction_at->diffInDays(now())
                    : null;

                return [
                    'id' => $lead->id,
                    'name' => $lead->name,
                    'priority' => $lead->priority?->value,
                    'status' => $lead->status,
                    'last_interaction_at' => $lead->last_interaction_at?->toIso8601String(),
                    'days_since_contact' => $daysSince,
                    'next_action' => $lead->next_action,
                    'recommended_action' => $this->recommendFollowUp($lead, $daysSince),
                ];
            })
            ->values()
            ->all();

        $payload = $this->readListPresenter->enrichPayload($items, $total);
        if ($countOnly) {
            $payload['count_only'] = true;
        }

        $truncated = ($payload['truncated'] ?? false) === true;
        $header = $this->readListPresenter->formatListHeader(
            resourceLabel: 'lead(s) needing follow-up',
            shownCount: count($items),
            scopeTotal: $total,
            filterLabel: null,
            truncated: $truncated,
            remainingCount: (int) ($payload['remaining_count'] ?? 0),
        );

        $summary = $total <= 0
            ? 'No leads requiring follow-up were found in your permitted scope.'
            : rtrim($header, ':') . ($countOnly ? '.' : ': Here are leads that need follow-up attention in your scope, ordered by priority and staleness.');

        if ($truncated && ! $countOnly && $total > 0) {
            $summary .= "\nWould you like me to list all of them?";
        }

        return [
            'tool' => 'crm.follow_up_summary',
            'summary' => $summary,
            'payload' => $payload,
            'sources' => ['crm.follow_up_summary'],
        ];
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    public function staleLeads(User $user, int $companyId, array $args = []): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $role = (string) $context['role'];
        $days = max(7, min(90, (int) ($args['days'] ?? self::STALE_DAYS)));
        $limit = max(1, min($this->readListPresenter->maxExpandedLimit('crm.stale_leads'), (int) ($args['limit'] ?? $this->readListPresenter->previewLimit())));
        $countOnly = ($args['count_only'] ?? false) === true;
        $threshold = now()->subDays($days);

        $query = Lead::query()
            ->where('company_id', $resolvedCompanyId)
            ->whereNull('converted_at')
            ->whereNotIn('status', [LeadStatus::WON->value, LeadStatus::LOST->value])
            ->where(function (Builder $builder) use ($threshold): void {
                $builder->whereNull('last_interaction_at')
                    ->orWhere('last_interaction_at', '<', $threshold);
            })
            ->orderBy('last_interaction_at');

        if ($role === 'agent') {
            $this->applyAgentLeadScope($query, (int) $user->id);
        }

        $total = (int) (clone $query)->count();

        $items = (clone $query)
            ->limit($limit)
            ->get()
            ->map(function (Lead $lead) use ($days): array {
                $daysSince = $lead->last_interaction_at !== null
                    ? (int) $lead->last_interaction_at->diffInDays(now())
                    : $days + 1;

                return [
                    'id' => $lead->id,
                    'name' => $lead->name,
                    'priority' => $lead->priority?->value,
                    'status' => $lead->status,
                    'days_since_contact' => $daysSince,
                    'last_interaction_at' => $lead->last_interaction_at?->toIso8601String(),
                ];
            })
            ->values()
            ->all();

        $payload = $this->readListPresenter->enrichPayload($items, $total);
        $payload['stale_threshold_days'] = $days;
        if ($countOnly) {
            $payload['count_only'] = true;
        }

        $truncated = ($payload['truncated'] ?? false) === true;
        $header = $this->readListPresenter->formatListHeader(
            resourceLabel: 'stale lead(s)',
            shownCount: count($items),
            scopeTotal: $total,
            filterLabel: null,
            truncated: $truncated,
            remainingCount: (int) ($payload['remaining_count'] ?? 0),
        );

        $summary = $total <= 0
            ? "No leads stale beyond {$days} days were found in your permitted scope."
            : rtrim($header, ':') . ($countOnly ? '.' : ": Found {$days}+ day stale leads in your scope that may need re-engagement.");

        if ($truncated && ! $countOnly && $total > 0) {
            $summary .= "\nWould you like me to list all of them?";
        }

        return [
            'tool' => 'crm.stale_leads',
            'summary' => $summary,
            'payload' => $payload,
            'sources' => ['crm.stale_leads'],
        ];
    }

    private function recommendFollowUp(Lead $lead, ?int $daysSince): string
    {
        if ($daysSince === null || $daysSince >= self::STALE_DAYS) {
            return $lead->priority === LeadPriority::URGENT || $lead->priority === LeadPriority::HIGH
                ? 'Schedule an urgent visit or call today'
                : 'Reach out to re-engage this lead';
        }

        if (trim((string) $lead->next_action) !== '') {
            return (string) $lead->next_action;
        }

        return 'Continue nurturing — check pipeline stage and propose next step';
    }

    private function applyAgentLeadScope(Builder $query, int $userId): void
    {
        $query->where(function (Builder $builder) use ($userId): void {
            $builder->where('created_by_user_id', $userId)
                ->orWhere('assigned_to_user_id', $userId);
        });
    }
}
