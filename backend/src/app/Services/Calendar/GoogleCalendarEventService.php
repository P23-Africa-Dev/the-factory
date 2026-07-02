<?php

declare(strict_types=1);

namespace App\Services\Calendar;

use App\Models\CompanyCalendarConnection;
use App\Models\Meeting;
use App\Models\UserCalendarConnection;
use App\Services\Google\GoogleTokenService;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class GoogleCalendarEventService
{
    public function __construct(
        private readonly GoogleTokenService $tokenService,
    ) {}

    /**
     * @return array{event_id:string,calendar_id:?string,meet_url:?string,html_link:?string,external_updated_at:?string}
     */
    public function upsertMeeting(Meeting $meeting, CompanyCalendarConnection|UserCalendarConnection $connection): array
    {
        $accessToken = $this->tokenService->resolveAccessToken($connection);
        $eventId = trim((string) ($meeting->google_event_id ?? ''));
        $calendarId = 'primary';

        $payload = $this->buildEventPayload($meeting);

        if ($eventId !== '') {
            Log::info('Updating Google Calendar event for meeting sync.', [
                'meeting_id' => $meeting->id,
                'calendar_id' => $calendarId,
                'google_event_id' => $eventId,
            ]);

            $response = Http::withToken($accessToken)
                ->timeout(30)
                ->patch(
                    'https://www.googleapis.com/calendar/v3/calendars/' . urlencode($calendarId) . '/events/' . urlencode($eventId) . '?conferenceDataVersion=1&sendUpdates=all',
                    $payload,
                );
        } else {
            $payload['conferenceData'] = [
                'createRequest' => [
                    'requestId' => 'meet-' . $meeting->id . '-' . time(),
                    'conferenceSolutionKey' => ['type' => 'hangoutsMeet'],
                ],
            ];

            Log::info('Creating Google Calendar event for meeting sync.', [
                'meeting_id' => $meeting->id,
                'calendar_id' => $calendarId,
                'attendee_count' => count($payload['attendees'] ?? []),
            ]);

            $response = Http::withToken($accessToken)
                ->timeout(30)
                ->post(
                    'https://www.googleapis.com/calendar/v3/calendars/' . urlencode($calendarId) . '/events?conferenceDataVersion=1&sendUpdates=all',
                    $payload,
                );
        }

        if (! $response->successful()) {
            Log::error('Google Calendar event sync request failed.', [
                'meeting_id' => $meeting->id,
                'calendar_id' => $calendarId,
                'google_event_id' => $eventId !== '' ? $eventId : null,
                'status' => $response->status(),
                'body' => $response->json() ?? $response->body(),
            ]);

            throw ValidationException::withMessages([
                'integration' => ['Google Calendar event sync failed: ' . $this->responseErrorMessage($response)],
            ]);
        }

        /** @var array<string,mixed> $event */
        $event = $response->json();

        Log::info('Google Calendar event sync request succeeded.', [
            'meeting_id' => $meeting->id,
            'calendar_id' => $calendarId,
            'google_event_id' => $event['id'] ?? $eventId,
            'hangout_link_present' => isset($event['hangoutLink']),
            'html_link_present' => isset($event['htmlLink']),
        ]);

        return [
            'event_id' => trim((string) ($event['id'] ?? $eventId)),
            'calendar_id' => $calendarId,
            'meet_url' => isset($event['hangoutLink']) ? (string) $event['hangoutLink'] : null,
            'html_link' => isset($event['htmlLink']) ? (string) $event['htmlLink'] : null,
            'external_updated_at' => isset($event['updated']) ? (string) $event['updated'] : null,
        ];
    }

    public function cancelMeeting(Meeting $meeting, CompanyCalendarConnection|UserCalendarConnection $connection): void
    {
        $eventId = trim((string) ($meeting->google_event_id ?? ''));

        if ($eventId === '') {
            return;
        }

        $accessToken = $this->tokenService->resolveAccessToken($connection);

        $response = Http::withToken($accessToken)
            ->timeout(30)
            ->delete('https://www.googleapis.com/calendar/v3/calendars/primary/events/' . urlencode($eventId) . '?sendUpdates=all');

        if (! $response->successful()) {
            Log::error('Google Calendar cancel request failed.', [
                'meeting_id' => $meeting->id,
                'google_event_id' => $eventId,
                'status' => $response->status(),
                'body' => $response->json() ?? $response->body(),
            ]);

            throw ValidationException::withMessages([
                'integration' => ['Google Calendar event cancel failed: ' . $this->responseErrorMessage($response)],
            ]);
        }

        Log::info('Google Calendar event cancellation succeeded.', [
            'meeting_id' => $meeting->id,
            'google_event_id' => $eventId,
        ]);
    }

    /**
     * @return array<string,mixed>
     */
    private function buildEventPayload(Meeting $meeting): array
    {
        $meeting->loadMissing('attendees');

        return [
            'summary' => $meeting->title,
            'description' => $meeting->description,
            'location' => $meeting->location,
            'start' => [
                'dateTime' => $meeting->start_at?->toIso8601String(),
                'timeZone' => $meeting->timezone,
            ],
            'end' => [
                'dateTime' => $meeting->end_at?->toIso8601String(),
                'timeZone' => $meeting->timezone,
            ],
            'attendees' => $meeting->attendees
                ->map(function ($attendee): array {
                    $payload = [
                        'email' => $attendee->email,
                    ];

                    if ((bool) $attendee->is_optional) {
                        $payload['optional'] = true;
                    }

                    $responseStatus = $this->normalizeAttendeeResponseStatus((string) $attendee->response_status);

                    if ($responseStatus !== null) {
                        $payload['responseStatus'] = $responseStatus;
                    }

                    $displayName = trim((string) $attendee->display_name);

                    if ($displayName !== '') {
                        $payload['displayName'] = $displayName;
                    }

                    return $payload;
                })
                ->values()
                ->all(),
            'status' => $meeting->status === 'cancelled' ? 'cancelled' : 'confirmed',
        ];
    }

    private function normalizeAttendeeResponseStatus(string $status): ?string
    {
        return match (strtolower(trim($status))) {
            'accepted' => 'accepted',
            'declined' => 'declined',
            'tentative' => 'tentative',
            'needs_action', 'needsaction' => 'needsAction',
            default => null,
        };
    }

    private function responseErrorMessage($response): string
    {
        /** @var array<string,mixed> $payload */
        $payload = $response->json();

        $message = trim((string) Arr::get($payload, 'error.message', ''));

        if ($message !== '') {
            return $message;
        }

        $body = trim((string) $response->body());

        if ($body !== '') {
            return $body;
        }

        return 'Unknown Google Calendar API error.';
    }
}
