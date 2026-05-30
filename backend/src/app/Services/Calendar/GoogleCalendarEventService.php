<?php

declare(strict_types=1);

namespace App\Services\Calendar;

use App\Models\CompanyCalendarConnection;
use App\Models\Meeting;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class GoogleCalendarEventService
{
    /**
     * @return array{event_id:string,calendar_id:?string,meet_url:?string,html_link:?string,external_updated_at:?string}
     */
    public function upsertMeeting(Meeting $meeting, CompanyCalendarConnection $connection): array
    {
        $accessToken = $this->resolveAccessToken($connection);
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

    public function cancelMeeting(Meeting $meeting, CompanyCalendarConnection $connection): void
    {
        $eventId = trim((string) ($meeting->google_event_id ?? ''));

        if ($eventId === '') {
            return;
        }

        $accessToken = $this->resolveAccessToken($connection);

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

    private function resolveAccessToken(CompanyCalendarConnection $connection): string
    {
        $expiresAt = $connection->token_expires_at;

        if ($expiresAt !== null && $expiresAt->subSeconds(30)->isFuture()) {
            return (string) $connection->access_token_encrypted;
        }

        return $this->refreshAccessToken($connection);
    }

    private function refreshAccessToken(CompanyCalendarConnection $connection): string
    {
        $clientId = trim((string) config('services.google_calendar.client_id'));
        $clientSecret = trim((string) config('services.google_calendar.client_secret'));

        if ($clientId === '' || $clientSecret === '') {
            throw ValidationException::withMessages([
                'integration' => ['Google Calendar credentials are not configured.'],
            ]);
        }

        $response = Http::asForm()
            ->timeout(30)
            ->post('https://oauth2.googleapis.com/token', [
                'client_id' => $clientId,
                'client_secret' => $clientSecret,
                'grant_type' => 'refresh_token',
                'refresh_token' => (string) $connection->refresh_token_encrypted,
            ]);

        if (! $response->successful()) {
            $connection->update([
                'status' => 'error',
                'last_error_message' => 'Google token refresh failed.',
                'last_error_at' => now(),
            ]);

            throw ValidationException::withMessages([
                'integration' => ['Google token refresh failed. Owner reconnection may be required.'],
            ]);
        }

        /** @var array<string,mixed> $payload */
        $payload = $response->json();
        $newAccessToken = trim((string) ($payload['access_token'] ?? ''));

        if ($newAccessToken === '') {
            throw ValidationException::withMessages([
                'integration' => ['Google token refresh did not return an access token.'],
            ]);
        }

        $expiresIn = isset($payload['expires_in']) ? max(0, (int) $payload['expires_in']) : 0;

        $connection->update([
            'access_token_encrypted' => $newAccessToken,
            'token_expires_at' => $expiresIn > 0 ? now()->addSeconds($expiresIn) : null,
            'status' => 'active',
            'last_error_message' => null,
            'last_error_at' => null,
        ]);

        return $newAccessToken;
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
