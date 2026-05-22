<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Enums\TaskStatus;
use App\Models\Project;
use App\Models\Task;
use App\Services\Notification\NotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class DispatchScheduledNotificationsCommand extends Command
{
    protected $signature = 'notifications:dispatch-scheduled {--company_id= : Limit dispatch to a single company id}';

    protected $description = 'Dispatch due-soon, overdue, and project deadline notification reminders.';

    public function __construct(private readonly NotificationService $notificationService)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $companyId = $this->option('company_id') !== null ? (int) $this->option('company_id') : null;

        $this->dispatchTaskDueSoon($companyId);
        $this->dispatchTaskOverdue($companyId);
        $this->dispatchProjectDeadlineNear($companyId);

        $this->info('Scheduled notifications dispatched.');

        return self::SUCCESS;
    }

    private function dispatchTaskDueSoon(?int $companyId): void
    {
        $thresholdMinutes = max(1, (int) config('notifications.scheduling.due_soon_threshold_minutes', 120));
        $from = now();
        $to = now()->copy()->addMinutes($thresholdMinutes);

        Task::query()
            ->whereNotNull('assigned_agent_id')
            ->whereNotNull('due_at')
            ->whereNotIn('status', [TaskStatus::COMPLETED->value, TaskStatus::CANCELLED->value])
            ->whereBetween('due_at', [$from, $to])
            ->when($companyId !== null, fn($query) => $query->where('company_id', $companyId))
            ->chunkById(100, function ($tasks): void {
                foreach ($tasks as $task) {
                    if (! $task instanceof Task || $task->assigned_agent_id === null) {
                        continue;
                    }

                    $basePayload = [
                        'company_id' => (int) $task->company_id,
                        'type' => 'task.due_soon',
                        'category' => NotificationCategory::TASK->value,
                        'title' => 'Task due soon',
                        'message' => "Task '{$task->title}' is due at {$task->due_at?->toDateTimeString()}.",
                        'reference_type' => Task::class,
                        'reference_id' => (int) $task->id,
                        'action_url' => '/tasks/' . $task->id,
                        'action_route' => 'tasks.show',
                        'priority' => NotificationPriority::HIGH->value,
                        'metadata' => [
                            'task_id' => (int) $task->id,
                            'due_at' => $task->due_at?->toIso8601String(),
                        ],
                    ];

                    $this->notificationService->notifyUser((int) $task->assigned_agent_id, [
                        ...$basePayload,
                        'dedupe_key' => 'task-due-soon:' . $task->id . ':' . $task->due_at?->format('YmdHi'),
                    ]);

                    if ((int) $task->created_by_user_id === (int) $task->assigned_agent_id) {
                        $this->notificationService->notifyUser((int) $task->assigned_agent_id, [
                            ...$basePayload,
                            'type' => 'task.self_due_soon',
                            'title' => 'Self-task due soon',
                            'message' => "Your self-task '{$task->title}' is due at {$task->due_at?->toDateTimeString()}.",
                            'dedupe_key' => 'task-self-due-soon:' . $task->id . ':' . $task->due_at?->format('YmdHi'),
                        ]);
                    }
                }
            });
    }

    private function dispatchTaskOverdue(?int $companyId): void
    {
        Task::query()
            ->whereNotNull('assigned_agent_id')
            ->whereNotNull('due_at')
            ->where('due_at', '<', now())
            ->whereNotIn('status', [TaskStatus::COMPLETED->value, TaskStatus::CANCELLED->value])
            ->when($companyId !== null, fn($query) => $query->where('company_id', $companyId))
            ->chunkById(100, function ($tasks): void {
                foreach ($tasks as $task) {
                    if (! $task instanceof Task || $task->assigned_agent_id === null) {
                        continue;
                    }

                    $this->notificationService->notifyUser((int) $task->assigned_agent_id, [
                        'company_id' => (int) $task->company_id,
                        'type' => 'task.overdue',
                        'category' => NotificationCategory::TASK->value,
                        'title' => 'Task overdue',
                        'message' => "Task '{$task->title}' is overdue.",
                        'reference_type' => Task::class,
                        'reference_id' => (int) $task->id,
                        'action_url' => '/tasks/' . $task->id,
                        'action_route' => 'tasks.show',
                        'priority' => NotificationPriority::CRITICAL->value,
                        'metadata' => [
                            'task_id' => (int) $task->id,
                            'due_at' => $task->due_at?->toIso8601String(),
                        ],
                        'dedupe_key' => 'task-overdue:' . $task->id . ':' . now()->toDateString(),
                    ]);
                }
            });
    }

    private function dispatchProjectDeadlineNear(?int $companyId): void
    {
        $from = now()->toDateString();
        $to = now()->copy()->addDays(1)->toDateString();

        Project::query()
            ->whereNotNull('end_date')
            ->whereBetween('end_date', [$from, $to])
            ->when($companyId !== null, fn($query) => $query->where('company_id', $companyId))
            ->chunkById(100, function ($projects): void {
                foreach ($projects as $project) {
                    if (! $project instanceof Project) {
                        continue;
                    }

                    $recipientIds = DB::table('company_users')
                        ->where('company_id', $project->company_id)
                        ->whereIn('role', ['owner', 'admin', 'supervisor'])
                        ->pluck('user_id')
                        ->map(static fn($id): int => (int) $id)
                        ->merge([(int) ($project->project_manager_user_id ?? 0)])
                        ->filter(static fn(int $id): bool => $id > 0)
                        ->unique()
                        ->values();

                    foreach ($recipientIds as $recipientId) {
                        $this->notificationService->notifyUser((int) $recipientId, [
                            'company_id' => (int) $project->company_id,
                            'type' => 'project.deadline_near',
                            'category' => NotificationCategory::PROJECT->value,
                            'title' => 'Project deadline near',
                            'message' => "Project '{$project->name}' is approaching its deadline.",
                            'reference_type' => Project::class,
                            'reference_id' => (int) $project->id,
                            'action_url' => '/projects/' . $project->id,
                            'action_route' => 'projects.show',
                            'priority' => NotificationPriority::HIGH->value,
                            'metadata' => [
                                'project_id' => (int) $project->id,
                                'end_date' => $project->end_date?->toDateString(),
                            ],
                            'dedupe_key' => 'project-deadline-near:' . $project->id . ':' . $project->end_date?->toDateString() . ':' . (int) $recipientId,
                        ]);
                    }
                }
            });
    }
}
