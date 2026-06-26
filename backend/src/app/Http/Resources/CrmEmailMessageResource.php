<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CrmEmailMessageResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $timestamp = $this->sent_at ?? $this->received_at ?? $this->created_at;

        return [
            'id' => $this->id,
            'thread_id' => $this->thread_id,
            'lead_id' => $this->lead_id,
            'gmail_message_id' => $this->gmail_message_id,
            'gmail_thread_id' => $this->gmail_thread_id,
            'direction' => $this->direction?->value,
            'status' => $this->status?->value,
            'from_name' => $this->from_name,
            'from_email' => $this->from_email,
            'to_recipients' => $this->to_recipients,
            'cc_recipients' => $this->cc_recipients,
            'bcc_recipients' => $this->bcc_recipients,
            'subject' => $this->subject,
            'body_html' => $this->body_html,
            'body_text' => $this->body_text,
            'is_read' => $this->is_read,
            'is_starred' => $this->is_starred,
            'gmail_account_email' => $this->gmail_account_email,
            'error_message' => $this->error_message,
            'sent_at' => $this->sent_at?->toIso8601String(),
            'received_at' => $this->received_at?->toIso8601String(),
            'timestamp' => $timestamp?->toIso8601String(),
            'time_ago' => $timestamp?->diffForHumans(),
            'sent_by' => $this->whenLoaded('sentBy', fn (): ?array => $this->sentBy ? [
                'id' => $this->sentBy->id,
                'name' => $this->sentBy->name,
                'email' => $this->sentBy->email,
            ] : null),
            'attachments' => CrmEmailAttachmentResource::collection($this->whenLoaded('attachments')),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
