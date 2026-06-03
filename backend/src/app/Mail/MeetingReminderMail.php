<?php

declare(strict_types=1);

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class MeetingReminderMail extends Mailable
{
    use Queueable;
    use SerializesModels;

    /**
     * @param  array<string,mixed>  $meeting
     */
    public function __construct(
        public readonly string $organizationName,
        public readonly array $meeting,
        public readonly string $remaining,
        public readonly string $recipientEmail,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Reminder • ' . ($this->meeting['title'] ?? 'Upcoming Meeting'));
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.meeting-reminder',
            with: [
                'organizationName' => $this->organizationName,
                'meeting' => $this->meeting,
                'remaining' => $this->remaining,
                'recipientEmail' => $this->recipientEmail,
            ],
        );
    }
}
