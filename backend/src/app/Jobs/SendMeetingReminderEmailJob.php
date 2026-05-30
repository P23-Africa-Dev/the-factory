<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Mail\MeetingReminderMail;
use App\Models\MeetingReminder;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Mail;

class SendMeetingReminderEmailJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 1;

    public function __construct(public readonly int $reminderId)
    {
        $this->onQueue('notifications-email');
    }

    public function handle(): void
    {
        $reminder = MeetingReminder::query()->with(['meeting.attendees', 'meeting.creator', 'meeting.company'])->find($this->reminderId);

        if (! $reminder) {
            return;
        }

        if (in_array($reminder->status, ['sent', 'cancelled'], true)) {
            return;
        }

        $meeting = $reminder->meeting;

        if (! $meeting || $meeting->status !== 'scheduled') {
            $reminder->update([
                'status' => 'cancelled',
                'last_error' => 'Meeting is unavailable or not scheduled.',
            ]);

            return;
        }

        $remaining = now()->diffForHumans($meeting->start_at, [
            'parts' => 2,
            'short' => false,
            'join' => true,
            'syntax' => \Carbon\CarbonInterface::DIFF_RELATIVE_TO_NOW,
        ]);

        try {
            Mail::to($reminder->recipient_email)->send(new MeetingReminderMail(
                organizationName: (string) ($meeting->company?->name ?? 'The Factory'),
                meeting: [
                    'id' => $meeting->id,
                    'title' => $meeting->title,
                    'description' => $meeting->description,
                    'timezone' => $meeting->timezone,
                    'start_at' => $meeting->start_at?->toIso8601String(),
                    'end_at' => $meeting->end_at?->toIso8601String(),
                    'google_meet_url' => $meeting->google_meet_url,
                    'organizer_name' => $meeting->creator?->name,
                    'organizer_email' => $meeting->creator?->email,
                ],
                remaining: $remaining,
                recipientEmail: $reminder->recipient_email,
            ));

            $reminder->update([
                'status' => 'sent',
                'sent_at' => now(),
                'last_attempt_at' => now(),
                'last_error' => null,
            ]);
        } catch (\Throwable $exception) {
            $attempts = (int) $reminder->attempts + 1;
            $retryDelayMinutes = min(60, 5 * $attempts);

            $reminder->update([
                'status' => 'failed',
                'attempts' => $attempts,
                'last_attempt_at' => now(),
                'next_retry_at' => now()->addMinutes($retryDelayMinutes),
                'last_error' => $exception->getMessage(),
            ]);

            throw $exception;
        }
    }
}
