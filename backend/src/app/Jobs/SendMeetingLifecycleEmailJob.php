<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Mail\MeetingLifecycleMail;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class SendMeetingLifecycleEmailJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 3;

    public array $backoff = [30, 120, 300];

    /**
     * @param  array<string,mixed>  $meeting
     * @param  array<int,array<string,mixed>>  $attendees
     * @param  array<int,string>  $recipientEmails
     */
    public function __construct(
        public readonly string $eventType,
        public readonly string $organizationName,
        public readonly array $meeting,
        public readonly array $attendees,
        public readonly array $recipientEmails,
    ) {
        $this->onQueue('notifications-email');
    }

    public function handle(): void
    {
        foreach ($this->recipientEmails as $recipientEmail) {
            Mail::to($recipientEmail)->send(new MeetingLifecycleMail(
                eventType: $this->eventType,
                organizationName: $this->organizationName,
                meeting: $this->meeting,
                attendees: $this->attendees,
                recipientEmail: $recipientEmail,
            ));
        }

        Log::info('Meeting lifecycle emails sent.', [
            'event_type' => $this->eventType,
            'meeting_id' => $this->meeting['id'] ?? null,
            'recipient_count' => count($this->recipientEmails),
        ]);
    }
}
