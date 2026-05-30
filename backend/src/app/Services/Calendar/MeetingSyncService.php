<?php

declare(strict_types=1);

namespace App\Services\Calendar;

use App\Models\CompanyCalendarConnection;
use App\Models\Meeting;

class MeetingSyncService
{
    public function __construct(private readonly GoogleCalendarEventService $googleCalendarEventService) {}

    public function syncMeeting(int $meetingId): void
    {
        $meeting = Meeting::query()
            ->with('attendees')
            ->find($meetingId);

        if (! $meeting) {
            return;
        }

        $connection = $this->activeConnection((int) $meeting->company_id);

        if (! $connection) {
            $meeting->update([
                'sync_status' => 'pending_setup',
                'sync_error_message' => 'Owner must connect Google Calendar to enable sync.',
            ]);

            return;
        }

        try {
            $event = $this->googleCalendarEventService->upsertMeeting($meeting, $connection);

            $meeting->update([
                'google_event_id' => $event['event_id'],
                'google_calendar_id' => $event['calendar_id'],
                'google_meet_url' => $event['meet_url'],
                'google_html_link' => $event['html_link'],
                'sync_status' => 'synced',
                'sync_error_message' => null,
                'synced_at' => now(),
                'external_updated_at' => $event['external_updated_at'] ?? null,
            ]);
        } catch (\Throwable $exception) {
            $meeting->update([
                'sync_status' => 'failed',
                'sync_error_message' => $exception->getMessage(),
            ]);

            throw $exception;
        }
    }

    public function cancelMeeting(int $meetingId): void
    {
        $meeting = Meeting::query()->find($meetingId);

        if (! $meeting) {
            return;
        }

        $connection = $this->activeConnection((int) $meeting->company_id);

        if (! $connection) {
            $meeting->update([
                'sync_status' => 'pending_setup',
                'sync_error_message' => 'Owner must connect Google Calendar to enable sync.',
            ]);

            return;
        }

        try {
            $this->googleCalendarEventService->cancelMeeting($meeting, $connection);

            $meeting->update([
                'sync_status' => 'synced',
                'sync_error_message' => null,
                'synced_at' => now(),
            ]);
        } catch (\Throwable $exception) {
            $meeting->update([
                'sync_status' => 'failed',
                'sync_error_message' => $exception->getMessage(),
            ]);

            throw $exception;
        }
    }

    private function activeConnection(int $companyId): ?CompanyCalendarConnection
    {
        return CompanyCalendarConnection::query()
            ->where('company_id', $companyId)
            ->where('status', 'active')
            ->whereNull('disconnected_at')
            ->first();
    }
}
