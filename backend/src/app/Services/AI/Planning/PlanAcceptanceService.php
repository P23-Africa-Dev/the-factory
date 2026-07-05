<?php

declare(strict_types=1);

namespace App\Services\AI\Planning;

use App\Enums\NotificationCategory;
use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Models\Task;
use App\Models\User;
use App\Services\Company\CompanyContextService;
use App\Services\Notification\NotificationService;
use App\Services\Task\TaskService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PlanAcceptanceService
{
    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly TaskService $taskService,
        private readonly NotificationService $notificationService,
    ) {}

    /**
     * @param  array<int, array<string, mixed>>  $items
     * @return array{created: array<int, \App\Models\Task>, skipped: int, linked_existing: int}
     */
    public function accept(User $user, int $companyId, string $planDate, array $items): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;

        $created = [];
        $skipped = 0;
        $linkedExisting = 0;

        DB::transaction(function () use ($user, $resolvedCompanyId, $items, &$created, &$skipped, &$linkedExisting): void {
            foreach ($items as $index => $item) {
                if (! is_array($item)) {
                    throw ValidationException::withMessages([
                        "items.{$index}" => ['Each plan item must be an object.'],
                    ]);
                }

                if (($item['creates_task'] ?? false) !== true) {
                    if (! empty($item['linked_task_id'])) {
                        $linkedExisting++;
                    }

                    continue;
                }

                $validated = $this->validateDraftItem($item, $index);
                $dedupeKey = (string) ($validated['dedupe_key'] ?? '');

                if ($dedupeKey !== '' && $this->taskAlreadyCreatedFromPlan((int) $user->id, $resolvedCompanyId, $dedupeKey)) {
                    $skipped++;

                    continue;
                }

                $task = $this->taskService->createSelf($user, [
                    'company_id' => $resolvedCompanyId,
                    'title' => $validated['title'],
                    'type' => $validated['type'] ?? null,
                    'description' => $validated['description'] ?? null,
                    'location' => $validated['location'] ?? null,
                    'latitude' => $validated['latitude'] ?? null,
                    'longitude' => $validated['longitude'] ?? null,
                    'due_date' => $validated['due_date'] ?? null,
                    'priority' => $validated['priority'] ?? 'medium',
                ]);

                $created[] = $task;
            }
        });

        if (count($created) > 0) {
            $this->notifyPlanAccepted($user, $resolvedCompanyId, count($created));
        }

        return [
            'created' => $created,
            'skipped' => $skipped,
            'linked_existing' => $linkedExisting,
        ];
    }

    /**
     * @param  array<string, mixed>  $item
     * @return array<string, mixed>
     */
    private function validateDraftItem(array $item, int $index): array
    {
        $validator = validator($item, [
            'creates_task' => ['required', 'boolean'],
            'dedupe_key' => ['nullable', 'string', 'max:128'],
            'title' => ['required', 'string', 'min:3', 'max:255'],
            'type' => ['nullable', 'string', Rule::in(TaskType::values())],
            'description' => ['nullable', 'string', 'min:10', 'max:5000'],
            'due_date' => ['nullable', 'date'],
            'priority' => ['nullable', 'string', Rule::in(TaskPriority::values())],
            'location' => ['nullable', 'string', 'min:2', 'max:255'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'linked_task_id' => ['nullable', 'integer'],
        ]);

        if ($validator->fails()) {
            throw ValidationException::withMessages(
                collect($validator->errors()->messages())
                    ->mapWithKeys(static fn(array $messages, string $field): array => ["items.{$index}.{$field}" => $messages])
                    ->all(),
            );
        }

        return $validator->validated();
    }

    private function taskAlreadyCreatedFromPlan(int $userId, int $companyId, string $dedupeKey): bool
    {
        $marker = '[plan:' . $dedupeKey . ']';

        return Task::query()
            ->where('company_id', $companyId)
            ->where('assigned_agent_id', $userId)
            ->whereNotIn('status', [TaskStatus::CANCELLED->value])
            ->where('description', 'like', '%' . $marker . '%')
            ->exists();
    }

    private function notifyPlanAccepted(User $user, int $companyId, int $createdCount): void
    {
        $this->notificationService->notifyUser((int) $user->id, [
            'company_id' => $companyId,
            'type' => 'daily_plan.accepted',
            'category' => NotificationCategory::TASK->value,
            'title' => 'Daily plan activated',
            'message' => $createdCount === 1
                ? '1 task was added to your day from your accepted plan.'
                : "{$createdCount} tasks were added to your day from your accepted plan.",
            'action_url' => '/tasks',
            'dedupe_key' => 'daily-plan-accepted:' . $user->id . ':' . now()->toDateString() . ':' . $createdCount,
        ]);
    }
}
