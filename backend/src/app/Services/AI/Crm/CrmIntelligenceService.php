<?php

declare(strict_types=1);

namespace App\Services\AI\Crm;

use App\Enums\LeadPriority;
use App\Enums\LeadStatus;
use App\Models\Lead;
use App\Models\User;
use App\Services\Company\CompanyContextService;
use Illuminate\Database\Eloquent\Builder;

class CrmIntelligenceService
{
    private const STALE_DAYS = 14;

    public function __construct(private readonly CompanyContextService $companyContextService) {}

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    public function followUpSummary(User $user, int $companyId, array $args = []): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $role = (string) $context['role'];
        $limit = max(1, min(25, (int) ($args['limit'] ?? 10)));

        $query = Lead::query()
            ->where('company_id', $resolvedCompanyId)
            ->whereNull('converted_at')
            ->whereNotIn('status', [LeadStatus::WON->value, LeadStatus::LOST->value])
            ->orderByRaw("case priority when 'urgent' then 4 when 'high' then 3 when 'medium' then 2 else 1 end desc")
            ->orderBy('last_interaction_at')
            ->limit($limit);

        if ($role === 'agent') {
            $this->applyAgentLeadScope($query, (int) $user->id);
        }

        $items = $query->get()->map(function (Lead $lead): array {
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
        })->values()->all();

        return [
            'tool' => 'crm.follow_up_summary',
            'summary' => count($items) > 0
                ? 'Here are leads that need follow-up attention in your scope, ordered by priority and staleness.'
                : 'No leads requiring follow-up were found in your permitted scope.',
            'payload' => [
                'items' => $items,
                'count' => count($items),
            ],
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
        $limit = max(1, min(30, (int) ($args['limit'] ?? 15)));
        $threshold = now()->subDays($days);

        $query = Lead::query()
            ->where('company_id', $resolvedCompanyId)
            ->whereNull('converted_at')
            ->whereNotIn('status', [LeadStatus::WON->value, LeadStatus::LOST->value])
            ->where(function (Builder $builder) use ($threshold): void {
                $builder->whereNull('last_interaction_at')
                    ->orWhere('last_interaction_at', '<', $threshold);
            })
            ->orderBy('last_interaction_at')
            ->limit($limit);

        if ($role === 'agent') {
            $this->applyAgentLeadScope($query, (int) $user->id);
        }

        $items = $query->get()->map(function (Lead $lead) use ($days): array {
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
        })->values()->all();

        return [
            'tool' => 'crm.stale_leads',
            'summary' => count($items) > 0
                ? "Found {$days}+ day stale leads in your scope that may need re-engagement."
                : "No leads stale beyond {$days} days were found in your permitted scope.",
            'payload' => [
                'stale_threshold_days' => $days,
                'items' => $items,
                'count' => count($items),
            ],
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
