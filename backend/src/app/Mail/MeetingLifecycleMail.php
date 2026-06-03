<?php

declare(strict_types=1);

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class MeetingLifecycleMail extends Mailable
{
    use Queueable;
    use SerializesModels;

    /**
     * @param  array<string,mixed>  $meeting
     * @param  array<int,array<string,mixed>>  $attendees
     */
    public function __construct(
        public readonly string $eventType,
        public readonly string $organizationName,
        public readonly array $meeting,
        public readonly array $attendees,
        public readonly string $recipientEmail,
    ) {}

    public function envelope(): Envelope
    {
        $actionLabel = match ($this->eventType) {
            'created' => 'Meeting Scheduled',
            'updated' => 'Meeting Updated',
            'cancelled' => 'Meeting Cancelled',
            'deleted' => 'Meeting Deleted',
            default => 'Meeting Notification',
        };

        return new Envelope(subject: $actionLabel . ' • ' . ($this->meeting['title'] ?? 'Meeting'));
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.meeting-lifecycle',
            with: [
                'eventType' => $this->eventType,
                'organizationName' => $this->organizationName,
                'meeting' => $this->meeting,
                'attendees' => $this->attendees,
                'recipientEmail' => $this->recipientEmail,
            ],
        );
    }
}
