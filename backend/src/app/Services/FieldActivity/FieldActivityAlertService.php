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
            ->get();

        $supervisorIds = $this->supervisorIds((int) $company->id);

        foreach ($openStops as $stop) {
            $agent = User::query()->find($stop->user_id);
            $dwellHours = round($stop->arrived_at->diffInSeconds(now()) / 3600, 1);

            foreach ($supervisorIds as $supervisorId) {
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
                    'dedupe_key' => 'field-long-stationary:' . $stop->id,
                ]);
            }
            $count++;
        }

        return $count;
    }

    private function alertMissedExpectedVisits(Company $company): int
    {
        $count = 0;
        $today = now()->toDateString();

        $tasks = Task::query()
            ->where('company_id', $company->id)
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->whereDate('due_at', $today)
            ->whereIn('status', ['pending', 'in_progress', 'paused', 'resumed'])
            ->get();

        $supervisorIds = $this->supervisorIds((int) $company->id);

        foreach ($tasks as $task) {
            $visited = FieldStop::query()
                ->where('company_id', $company->id)
                ->where('task_id', $task->id)
                ->whereDate('arrived_at', $today)
                ->whereIn('classification', [
                    FieldStopClassification::CUSTOMER_VISIT->value,
                    FieldStopClassification::LEAD_VISIT->value,
                    FieldStopClassification::ORG_VISIT->value,
                ])
                ->exists();

            if ($visited) {
                continue;
            }

            // Only alert after closing-ish EOD hour.
            $eodHour = (int) config('field_activity.eod_hour', 19);
            if ((int) now()->format('G') < $eodHour) {
                continue;
            }

            foreach ($supervisorIds as $supervisorId) {
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
                    'dedupe_key' => 'field-missed-visit:' . $task->id . ':' . $today,
                ]);
            }
            $count++;
        }

        return $count;
    }

    /**
     * @return list<int>
     */
    private function supervisorIds(int $companyId): array
    {
        return DB::table('company_users')
            ->where('company_id', $companyId)
            ->whereIn('role', ['owner', 'admin', 'supervisor'])
            ->pluck('user_id')
            ->map(static fn ($id): int => (int) $id)
            ->unique()
            ->values()
            ->all();
    }

    public function closeSessionsPastEod(?int $companyId = null): int
    {
        $eodHour = (int) config('field_activity.eod_hour', 19);
        $closed = 0;

        $sessions = FieldActivitySession::query()
            ->where('status', FieldActivitySessionStatus::ACTIVE)
            ->when($companyId !== null, fn ($q) => $q->where('company_id', $companyId))
            ->where('started_at', '<', now()->startOfDay()->addHours($eodHour))
            ->whereDate('started_at', '<', now()->toDateString())
            ->get();

        $sessionService = app(FieldActivitySessionService::class);

        foreach ($sessions as $session) {
            $endedAt = Carbon::parse($session->started_at->toDateString())->setTime($eodHour, 0);
            $sessionService->completeSession($session, $endedAt, autoClosed: true, withNarrative: true);
            $closed++;
        }

        return $closed;
    }
}
