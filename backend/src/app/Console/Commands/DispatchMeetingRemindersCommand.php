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

        MeetingReminder::query()
            ->whereIn('status', ['pending', 'failed'])
            ->where('remind_at', '<=', now())
            ->where(function ($query): void {
                $query->whereNull('next_retry_at')
                    ->orWhere('next_retry_at', '<=', now());
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
                $updated = MeetingReminder::query()
                    ->where('id', $reminder->id)
                    ->whereIn('status', ['pending', 'failed'])
                    ->update([
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
