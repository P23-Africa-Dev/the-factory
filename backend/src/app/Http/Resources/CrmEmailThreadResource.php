<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CrmEmailThreadResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $latestMessage = null;

        if ($this->relationLoaded('messages') && $this->messages->isNotEmpty()) {
            $latestMessage = $this->messages
                ->sortByDesc(fn ($message) => $message->sent_at ?? $message->received_at)
                ->first();
        }

        return [
            'id' => $this->id,
            'lead_id' => $this->lead_id,
            'gmail_thread_id' => $this->gmail_thread_id,
            'subject' => $this->subject,
            'snippet' => $this->snippet,
            'last_message_at' => $this->last_message_at?->toIso8601String(),
            'time_ago' => $this->last_message_at?->diffForHumans(),
            'unread_count' => $this->unread_count,
            'message_count' => $this->message_count,
            'participant_emails' => $this->participant_emails,
            'latest_message' => $latestMessage ? new CrmEmailMessageResource($latestMessage) : null,
            'messages' => CrmEmailMessageResource::collection($this->whenLoaded('messages')),
        ];
    }
}
