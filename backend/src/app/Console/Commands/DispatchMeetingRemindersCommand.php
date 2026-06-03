<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Jobs\SendMeetingReminderEmailJob;
use App\Models\MeetingReminder;
use Illuminate\Console\Command;

class DispatchMeetingRemindersCommand extends Command
{
    protected $signature = 'meetings:dispatch-reminders {--company_id= : Limit dispatch to one company id}';

    protected $description = 'Dispatch due meeting reminder emails.';

    public function handle(): int
    {
        $companyId = $this->option('company_id') !== null ? (int) $this->option('company_id') : null;
        $staleQueueMinutes = max(1, (int) config('meetings.reminders.stale_queue_minutes', 15));
        $staleQueueThreshold = now()->subMinutes($staleQueueMinutes);

        MeetingReminder::query()
            ->where(function ($query) use ($staleQueueThreshold): void {
                $query->where(function ($pendingOrFailed) use ($staleQueueThreshold): void {
                    $pendingOrFailed
                        ->whereIn('status', ['pending', 'failed'])
                        ->where('remind_at', '<=', now())
                        ->where(function ($retryQuery): void {
                            $retryQuery->whereNull('next_retry_at')
                                ->orWhere('next_retry_at', '<=', now());
                        });
                })->orWhere(function ($queuedStale) use ($staleQueueThreshold): void {
                    $queuedStale
                        ->where('status', 'queued')
                        ->whereNotNull('queued_at')
                        ->where('queued_at', '<=', $staleQueueThreshold);
                });
            })
            ->when($companyId !== null, function ($query) use ($companyId): void {
                $query->whereHas('meeting', static function ($meetingQuery) use ($companyId): void {
                    $meetingQuery->where('company_id', $companyId);
                });
            })
            ->orderBy('remind_at')
            ->limit(200)
            ->get()
            ->each(function (MeetingReminder $reminder): void {
                $markQueued = MeetingReminder::query()->where('id', $reminder->id);

                if (in_array($reminder->status, ['pending', 'failed'], true)) {
                    $markQueued->whereIn('status', ['pending', 'failed']);
                } else {
                    $markQueued
                        ->where('status', 'queued')
                        ->whereNotNull('queued_at')
                        ->where('queued_at', '<=', now()->subMinutes(max(1, (int) config('meetings.reminders.stale_queue_minutes', 15))));
                }

                $updated = $markQueued->update([
                    'status' => 'queued',
                    'queued_at' => now(),
                    'updated_at' => now(),
                ]);

                if ($updated > 0) {
                    SendMeetingReminderEmailJob::dispatch((int) $reminder->id);
                }
            });

        $this->info('Meeting reminders dispatch cycle completed.');

        return self::SUCCESS;
    }
}
