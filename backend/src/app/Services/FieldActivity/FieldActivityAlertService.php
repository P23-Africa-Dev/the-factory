<?php

declare(strict_types=1);

namespace App\Services\FieldActivity;

use App\Enums\FieldActivitySessionStatus;
use App\Enums\FieldStopClassification;
use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Models\Company;
use App\Models\FieldActivitySession;
use App\Models\FieldStop;
use App\Models\Task;
use App\Models\User;
use App\Services\Notification\NotificationService;
use App\Support\CompanyClock;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class FieldActivityAlertService
{
    public function __construct(
        private readonly NotificationService $notificationService,
    ) {}

    /**
     * @return array{long_stationary: int, missed_visits: int}
     */
    public function scanCompany(Company $company): array
    {
        $longStationary = $this->alertLongStationary($company);
        $missedVisits = $this->alertMissedExpectedVisits($company);

        return [
            'long_stationary' => $longStationary,
            'missed_visits' => $missedVisits,
        ];
    }

    private function alertLongStationary(Company $company): int
    {
        $threshold = (int) config('field_activity.long_stationary_alert_seconds', 10800);
        $count = 0;

        $openStops = FieldStop::query()
            ->where('company_id', $company->id)
            ->whereNull('departed_at')
            ->where('arrived_at', '<=', now()->subSeconds($threshold))
            ->with('user:id,name,supervisor_user_id')
            ->get();

        $adminIds = $this->adminIds((int) $company->id);

        foreach ($openStops as $stop) {
            $agent = $stop->user;
            $dwellHours = round($stop->arrived_at->diffInSeconds(now()) / 3600, 1);

            foreach ($this->recipientsFor((int) $company->id, $adminIds, $agent) as $supervisorId) {
                $this->notificationService->notifyUser($supervisorId, [
                    'company_id' => (int) $company->id,
                    'type' => 'field_activity.long_stationary',
                    'category' => NotificationCategory::TRACKING->value,
                    'title' => 'Long stationary alert',
                    'message' => sprintf(
                        '%s has been stationary for %.1f hours during work time.',
                        $agent?->name ?? 'An agent',
                        $dwellHours,
                    ),
                    'reference_type' => FieldStop::class,
                    'reference_id' => (int) $stop->id,
                    'action_url' => '/insight',
                    'action_route' => 'insight',
                    'priority' => NotificationPriority::HIGH->value,
                    'created_by_user_id' => null,
                    'metadata' => [
                        'agent_user_id' => $stop->user_id,
                        'field_stop_id' => $stop->id,
                        'dwell_seconds' => $stop->arrived_at->diffInSeconds(now()),
                    ],
                    // Notifications dedupe globally on the key: one per recipient.
                    'dedupe_key' => 'field-long-stationary:' . $stop->id . ':u' . $supervisorId,
                ]);
            }
            $count++;
        }

        return $count;
    }

    private function alertMissedExpectedVisits(Company $company): int
    {
        $count = 0;
        // The company's own day and end-of-day hour, not the server's.
        $companyNow = CompanyClock::now($company);
        $today = $companyNow->toDateString();
        [$dayStart, $dayEnd] = CompanyClock::dayBounds($company, $today);

        // Only alert after closing-ish EOD hour.
        $eodHour = (int) config('field_activity.eod_hour', 19);
        if ((int) $companyNow->format('G') < $eodHour) {
            return 0;
        }

        $tasks = Task::query()
            ->where('company_id', $company->id)
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->whereBetween('due_at', [$dayStart, $dayEnd])
            ->whereIn('status', ['pending', 'in_progress', 'paused', 'resumed'])
            ->with('assignments')
            ->get();

        $adminIds = $this->adminIds((int) $company->id);

        foreach ($tasks as $task) {
            $visited = FieldStop::query()
                ->where('company_id', $company->id)
                ->where('task_id', $task->id)
                ->whereBetween('arrived_at', [$dayStart, $dayEnd])
                ->whereIn('classification', [
                    FieldStopClassification::CUSTOMER_VISIT->value,
                    FieldStopClassification::LEAD_VISIT->value,
                    FieldStopClassification::ORG_VISIT->value,
                ])
                ->exists();

            if ($visited) {
                continue;
            }

            $recipients = $adminIds;
            foreach ($this->assigneesOf($task) as $assignee) {
                $recipients = $this->recipientsFor((int) $company->id, $recipients, $assignee);
            }

            foreach (array_values(array_unique($recipients)) as $supervisorId) {
                $this->notificationService->notifyUser($supervisorId, [
                    'company_id' => (int) $company->id,
                    'type' => 'field_activity.missed_visit',
                    'category' => NotificationCategory::TRACKING->value,
                    'title' => 'Missed expected visit',
                    'message' => sprintf('Expected visit for task "%s" was not recorded today.', $task->title ?? ('#'.$task->id)),
                    'reference_type' => Task::class,
                    'reference_id' => (int) $task->id,
                    'action_url' => '/insight',
                    'action_route' => 'insight',
                    'priority' => NotificationPriority::NORMAL->value,
                    'created_by_user_id' => null,
                    'metadata' => [
                        'task_id' => $task->id,
                        'date' => $today,
                    ],
                    'dedupe_key' => 'field-missed-visit:' . $task->id . ':' . $today . ':u' . $supervisorId,
                ]);
            }
            $count++;
        }

        return $count;
    }

    /**
     * Owners and admins see every alert.
     *
     * @return list<int>
     */
    private function adminIds(int $companyId): array
    {
        return DB::table('company_users')
            ->where('company_id', $companyId)
            ->whereIn('role', ['owner', 'admin'])
            ->pluck('user_id')
            ->map(static fn ($id): int => (int) $id)
            ->unique()
            ->values()
            ->all();
    }

    /**
     * Owners/admins plus the person's own supervisor (other supervisors do not
     * see people outside their team). Never the person themself.
     *
     * @param  list<int>  $base
     * @return list<int>
     */
    private function recipientsFor(int $companyId, array $base, ?User $person): array
    {
        $ids = $base;
        $supervisorId = $person?->supervisor_user_id;
        if ($supervisorId !== null) {
            $isSupervisor = DB::table('company_users')
                ->where('company_id', $companyId)
                ->where('user_id', $supervisorId)
                ->whereIn('role', ['owner', 'admin', 'supervisor'])
                ->exists();
            if ($isSupervisor) {
                $ids[] = (int) $supervisorId;
            }
        }

        return array_values(array_diff(array_unique($ids), $person !== null ? [(int) $person->id] : []));
    }

    /**
     * @return list<User>
     */
    private function assigneesOf(Task $task): array
    {
        $userIds = collect($task->assignments ?? [])
            ->map(static fn ($a): ?int => isset($a->assigned_agent_id) ? (int) $a->assigned_agent_id : null)
            ->filter()
            ->unique()
            ->values()
            ->all();

        return $userIds === [] ? [] : User::query()->whereIn('id', $userIds)->get(['id', 'supervisor_user_id'])->all();
    }

    public function closeSessionsPastEod(?int $companyId = null): int
    {
        $eodHour = (int) config('field_activity.eod_hour', 19);
        $closed = 0;

        // Legacy clock-in sessions only. Field trips are independent of the work
        // day: they end by the user, or by FieldTripService::monitor (no signal).
        $sessions = FieldActivitySession::query()
            ->where('status', FieldActivitySessionStatus::ACTIVE)
            ->where('source', FieldActivitySession::SOURCE_ATTENDANCE)
            ->when($companyId !== null, fn ($q) => $q->where('company_id', $companyId))
            ->where('started_at', '<', now()->startOfDay())
            ->get();

        $sessionService = app(FieldActivitySessionService::class);

        foreach ($sessions as $session) {
            // EOD of the day the session started, in the company's time zone.
            $tz = CompanyClock::timezone((int) $session->company_id);
            $localDay = $session->started_at->copy()->setTimezone($tz)->toDateString();
            if ($localDay >= CompanyClock::today((int) $session->company_id)) {
                continue;
            }
            $endedAt = Carbon::parse($localDay, $tz)->setTime($eodHour, 0)->setTimezone((string) config('app.timezone'));
            $sessionService->completeSession($session, $endedAt, autoClosed: true, withNarrative: true, endReason: FieldActivitySession::END_REASON_AUTO_LEGACY);
            $closed++;
        }

        return $closed;
    }
}
