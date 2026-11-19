<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Jobs\ExecuteAutomationRuleJob;
use App\Models\AiAutomationRule;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Runs ELY automation rules with a schedule.daily / schedule.weekly trigger.
 *
 * Expressions are stored by AutomationRuleService as "daily:HH:MM" or
 * "weekly:<weekday>:HH:MM" in the application timezone. A rule is due when its
 * most recent scheduled occurrence has passed and it has not run since then.
 * The job runs as the rule's creator, so role and company checks still apply.
 */
class RunScheduledAutomationsCommand extends Command
{
    protected $signature = 'ely:run-scheduled-automations';

    protected $description = 'Dispatch ELY automation rules whose daily/weekly schedule is due, and overdue-task rules once a day while tasks are overdue.';

    public function handle(): int
    {
        $now = Carbon::now();
        $dispatched = 0;

        AiAutomationRule::query()
            ->where('status', 'active')
            ->whereIn('trigger_type', ['schedule.daily', 'schedule.weekly'])
            ->orderBy('id')
            ->chunkById(200, function ($rules) use ($now, &$dispatched): void {
                foreach ($rules as $rule) {
                    $occurrence = self::latestOccurrence(
                        (string) $rule->trigger_type,
                        (string) ($rule->trigger_expression ?? ''),
                        $now,
                    );

                    if ($occurrence === null) {
                        continue;
                    }

                    $lastRun = $rule->last_run_at;
                    if ($lastRun !== null && $lastRun->greaterThanOrEqualTo($occurrence)) {
                        continue;
                    }

                    // Never back-fill a run for a schedule that existed before the rule.
                    if ($rule->created_at !== null && $rule->created_at->greaterThan($occurrence)) {
                        continue;
                    }

                    // Claim this occurrence before queueing so a slow queue
                    // cannot cause a second dispatch on the next run.
                    $rule->forceFill(['last_run_at' => $now])->save();

                    ExecuteAutomationRuleJob::dispatch(
                        (int) $rule->id,
                        (int) $rule->created_by_user_id,
                        (int) $rule->company_id,
                    );
                    $dispatched++;
                }
            });

        // "When tasks are overdue" rules: at most once a day per rule, and only
        // while the company has overdue open tasks.
        AiAutomationRule::query()
            ->where('status', 'active')
            ->where('trigger_type', 'event.tasks.overdue')
            ->orderBy('id')
            ->chunkById(200, function ($rules) use ($now, &$dispatched): void {
                foreach ($rules as $rule) {
                    if ($rule->last_run_at !== null && $rule->last_run_at->isSameDay($now)) {
                        continue;
                    }

                    $hasOverdue = \App\Models\Task::query()
                        ->where('company_id', $rule->company_id)
                        ->whereNotNull('due_at')
                        ->where('due_at', '<', $now)
                        ->whereNotIn('status', ['completed', 'cancelled'])
                        ->exists();
                    if (! $hasOverdue) {
                        continue;
                    }

                    $rule->forceFill(['last_run_at' => $now])->save();
                    ExecuteAutomationRuleJob::dispatch((int) $rule->id, (int) $rule->created_by_user_id, (int) $rule->company_id);
                    $dispatched++;
                }
            });

        $this->info("Dispatched {$dispatched} scheduled automation(s).");

        return self::SUCCESS;
    }

    /**
     * The most recent time at or before $now when the rule should have run.
     */
    public static function latestOccurrence(string $triggerType, string $expression, Carbon $now): ?Carbon
    {
        $parts = explode(':', strtolower(trim($expression)));

        if ($triggerType === 'schedule.daily' && count($parts) === 3 && $parts[0] === 'daily') {
            [$hour, $minute] = [(int) $parts[1], (int) $parts[2]];
            $candidate = $now->copy()->setTime($hour, $minute);

            return $candidate->greaterThan($now) ? $candidate->subDay() : $candidate;
        }

        if ($triggerType === 'schedule.weekly' && count($parts) === 4 && $parts[0] === 'weekly') {
            $weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            $weekday = array_search($parts[1], $weekdays, true);
            if ($weekday === false) {
                return null;
            }

            [$hour, $minute] = [(int) $parts[2], (int) $parts[3]];
            $daysBack = ($now->dayOfWeek - $weekday + 7) % 7;
            $candidate = $now->copy()->subDays($daysBack)->setTime($hour, $minute);

            return $candidate->greaterThan($now) ? $candidate->subWeek() : $candidate;
        }

        return null;
    }
}
