<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MeetingResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'company_id' => $this->company_id,
            'created_by_user_id' => $this->created_by_user_id,
            'project_id' => $this->project_id,
            'task_id' => $this->task_id,
            'title' => $this->title,
            'description' => $this->description,
            'location' => $this->location,
            'timezone' => $this->timezone,
            'start_at' => $this->start_at?->toIso8601String(),
            'end_at' => $this->end_at?->toIso8601String(),
            'status' => $this->status,
            'source_page' => $this->source_page,
            'organizer_email_snapshot' => $this->organizer_email_snapshot,
            'organizer_name_snapshot' => $this->organizer_name_snapshot,
            'reminder_config' => $this->reminder_config ?? [],
            'meeting_settings' => $this->meeting_settings,
            'google_event_id' => $this->google_event_id,
            'google_calendar_id' => $this->google_calendar_id,
            'google_meet_url' => $this->google_meet_url,
            'google_html_link' => $this->google_html_link,
            'sync_status' => $this->sync_status,
            'sync_error_message' => $this->sync_error_message,
            'synced_at' => $this->synced_at?->toIso8601String(),
            'external_updated_at' => $this->external_updated_at?->toIso8601String(),
            'attendees' => $this->whenLoaded('attendees', function (): array {
                return $this->attendees
                    ->map(fn($attendee): array => [
                        'id' => $attendee->id,
                        'user_id' => $attendee->user_id,
                        'lead_id' => $attendee->lead_id,
                        'email' => $attendee->email,
                        'display_name' => $attendee->display_name,
                        'response_status' => $attendee->response_status,
                        'is_optional' => (bool) $attendee->is_optional,
                        'is_organizer' => (bool) $attendee->is_organizer,
                    ])
                    ->values()
                    ->all();
            }),
            'leads' => $this->whenLoaded('leads', function (): array {
                return $this->leads
                    ->map(fn($lead): array => [
                        'id' => $lead->id,
                        'name' => $lead->name,
                        'email' => $lead->email,
                        'phone' => $lead->phone,
                        'status' => $lead->status,
                    ])
                    ->values()
                    ->all();
            }),
            'creator' => $this->whenLoaded('creator', fn(): ?array => $this->creator ? [
                'id' => $this->creator->id,
                'name' => $this->creator->name,
                'email' => $this->creator->email,
            ] : null),
            'reminders' => $this->whenLoaded('reminders', function (): array {
                return $this->reminders
                    ->map(fn($reminder): array => [
                        'id' => $reminder->id,
                        'recipient_user_id' => $reminder->recipient_user_id,
                        'recipient_email' => $reminder->recipient_email,
                        'recipient_name' => $reminder->recipient_name,
                        'offset_minutes' => $reminder->offset_minutes,
                        'custom_remind_at' => $reminder->custom_remind_at?->toIso8601String(),
                        'remind_at' => $reminder->remind_at?->toIso8601String(),
                        'status' => $reminder->status,
                        'attempts' => (int) $reminder->attempts,
                        'next_retry_at' => $reminder->next_retry_at?->toIso8601String(),
                        'sent_at' => $reminder->sent_at?->toIso8601String(),
                        'last_error' => $reminder->last_error,
                    ])
                    ->values()
                    ->all();
            }),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
