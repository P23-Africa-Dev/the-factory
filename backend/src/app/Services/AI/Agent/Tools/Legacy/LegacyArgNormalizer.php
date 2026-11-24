<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Tools\Legacy;

use App\Services\AI\Agent\Tools\ToolContext;
use App\Services\AI\Crm\EmailInferenceService;
use App\Services\AI\Crm\LeadInferenceService;
use App\Services\AI\Crm\VisitLogInferenceService;
use App\Services\AI\InternalUserInferenceService;
use App\Services\AI\Kpi\KpiInferenceService;
use App\Services\AI\MeetingInferenceService;
use App\Services\AI\NotificationInferenceService;
use App\Services\AI\TaskInferenceService;
use App\Services\AI\TaskReassignInferenceService;

/**
 * Applies the existing per-tool defaults (default pipeline and stage for
 * leads, timezone for meetings, name -> id lookups, agent self-assignment)
 * to arguments chosen by the model, so the tool-calling engine and the
 * legacy engine write the same records.
 */
final class LegacyArgNormalizer
{
    public function __construct(
        private readonly TaskInferenceService $tasks,
        private readonly TaskReassignInferenceService $reassign,
        private readonly VisitLogInferenceService $visits,
        private readonly MeetingInferenceService $meetings,
        private readonly LeadInferenceService $leads,
        private readonly EmailInferenceService $emails,
        private readonly KpiInferenceService $kpis,
        private readonly NotificationInferenceService $notifications,
        private readonly InternalUserInferenceService $internalUsers,
    ) {}

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    public function normalize(string $tool, array $args, ToolContext $context): array
    {
        $companyId = $context->companyId;
        $userId = (int) $context->user->id;

        return match ($tool) {
            'tasks.create' => $this->tasks->normalizeProvidedArgs('', $companyId, [], $args, $context->role),
            'tasks.reassign' => $this->reassign->normalizeProvidedArgs($companyId, $args),
            'crm.log_visit' => $this->visits->normalizeProvidedArgs($companyId, $args),
            'meetings.schedule' => $this->meetings->normalizeProvidedArgs(
                '',
                $companyId,
                $args,
                $context->timezone,
                null,
            ),
            'crm.create_lead' => $this->leads->normalizeProvidedArgs($companyId, $args, $context->role, $userId),
            'crm.send_email' => $this->emails->normalizeProvidedArgs($companyId, $args, $userId),
            'kpis.create' => $this->kpis->normalizeProvidedArgs($companyId, $args),
            'notifications.send' => $this->notifications->normalizeProvidedArgs($companyId, $args),
            'org.users.create' => $this->internalUsers->normalizeProvidedArgs($companyId, $args),
            default => $args,
        };
    }
}
