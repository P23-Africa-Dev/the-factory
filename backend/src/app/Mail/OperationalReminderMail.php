<?php

declare(strict_types=1);

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class OperationalReminderMail extends Mailable
{
    use Queueable;
    use SerializesModels;

    public function __construct(
        public readonly string $organizationName,
        public readonly string $recipientName,
        public readonly string $title,
        public readonly string $message,
        public readonly ?string $actionUrl = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Reminder • ' . $this->title);
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.operational-reminder',
            with: [
                'organizationName' => $this->organizationName,
                'recipientName' => $this->recipientName,
                'title' => $this->title,
                'message' => $this->message,
                'actionUrl' => $this->actionUrl,
            ],
        );
    }
}
