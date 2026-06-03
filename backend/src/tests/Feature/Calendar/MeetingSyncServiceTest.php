<?php

declare(strict_types=1);

namespace Tests\Feature\Calendar;

use App\Models\Company;
use App\Models\CompanyCalendarConnection;
use App\Models\Meeting;
use App\Models\MeetingAttendee;
use App\Models\User;
use App\Services\Calendar\MeetingSyncService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MeetingSyncServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('services.google_calendar.client_id', 'google-client-id');
        config()->set('services.google_calendar.client_secret', 'google-client-secret');
        config()->set('services.google_calendar.redirect_uri', 'http://localhost:8080/api/v1/calendar/integration/callback');
    }

    public function test_sync_meeting_sets_pending_setup_when_no_owner_connection(): void
    {
        [$company, $owner] = $this->seedCompanyUsers('FAC-SYNC001');

        $meeting = Meeting::create([
            'company_id' => $company->id,
            'created_by_user_id' => $owner->id,
            'title' => 'No Integration Meeting',
            'timezone' => 'Africa/Lagos',
            'start_at' => now()->addDay(),
            'end_at' => now()->addDay()->addHour(),
            'status' => 'scheduled',
            'source_page' => 'api',
            'sync_status' => 'pending',
        ]);

        app(MeetingSyncService::class)->syncMeeting((int) $meeting->id);

        $meeting->refresh();

        $this->assertSame('pending_setup', $meeting->sync_status);
        $this->assertSame('Owner must connect Google Calendar to enable sync.', $meeting->sync_error_message);
    }

    public function test_sync_meeting_updates_google_event_fields_on_success(): void
    {
        [$company, $owner] = $this->seedCompanyUsers('FAC-SYNC002');

        $connection = CompanyCalendarConnection::create([
            'company_id' => $company->id,
            'owner_user_id' => $owner->id,
            'organizer_email' => 'owner@factory23.test',
            'organizer_google_user_id' => 'google-owner-123',
            'access_token_encrypted' => 'access-token',
            'refresh_token_encrypted' => 'refresh-token',
            'token_expires_at' => now()->addHour(),
            'scopes' => ['https://www.googleapis.com/auth/calendar'],
            'status' => 'active',
            'connected_at' => now(),
        ]);

        $meeting = Meeting::create([
            'company_id' => $company->id,
            'created_by_user_id' => $owner->id,
            'title' => 'Google Sync Meeting',
            'description' => 'Sync this event to Google Calendar',
            'location' => 'HQ',
            'timezone' => 'Africa/Lagos',
            'start_at' => now()->addDays(2),
            'end_at' => now()->addDays(2)->addHour(),
            'status' => 'scheduled',
            'source_page' => 'api',
            'sync_status' => 'pending',
        ]);

        MeetingAttendee::create([
            'meeting_id' => $meeting->id,
            'email' => 'attendee@factory23.test',
            'display_name' => 'Attendee',
            'response_status' => 'needs_action',
            'is_optional' => false,
            'is_organizer' => false,
        ]);

        Http::fake([
            'https://www.googleapis.com/calendar/v3/calendars/primary/events*' => Http::response([
                'id' => 'event-123',
                'organizer' => ['email' => 'owner@factory23.test'],
                'hangoutLink' => 'https://meet.google.com/event-123',
                'htmlLink' => 'https://calendar.google.com/event?eid=123',
                'updated' => now()->toIso8601String(),
            ], 200),
        ]);

        app(MeetingSyncService::class)->syncMeeting((int) $meeting->id);

        Http::assertSent(function ($request): bool {
            $data = $request->data();

            return ($data['attendees'][0]['responseStatus'] ?? null) === 'needsAction'
                && ! isset($data['attendees'][0]['response_status']);
        });

        $meeting->refresh();
        $connection->refresh();

        $this->assertSame('synced', $meeting->sync_status);
        $this->assertSame('event-123', $meeting->google_event_id);
        $this->assertSame('primary', $meeting->google_calendar_id);
        $this->assertNotNull($meeting->google_meet_url);
        $this->assertNull($meeting->sync_error_message);
        $this->assertSame('active', $connection->status);
    }

    public function test_sync_meeting_refreshes_expired_access_token(): void
    {
        [$company, $owner] = $this->seedCompanyUsers('FAC-SYNC003');

        $connection = CompanyCalendarConnection::create([
            'company_id' => $company->id,
            'owner_user_id' => $owner->id,
            'organizer_email' => 'owner@factory23.test',
            'organizer_google_user_id' => 'google-owner-123',
            'access_token_encrypted' => 'expired-access-token',
            'refresh_token_encrypted' => 'refresh-token',
            'token_expires_at' => now()->subMinute(),
            'scopes' => ['https://www.googleapis.com/auth/calendar'],
            'status' => 'active',
            'connected_at' => now(),
        ]);

        $meeting = Meeting::create([
            'company_id' => $company->id,
            'created_by_user_id' => $owner->id,
            'title' => 'Refresh Token Meeting',
            'timezone' => 'Africa/Lagos',
            'start_at' => now()->addDays(3),
            'end_at' => now()->addDays(3)->addHour(),
            'status' => 'scheduled',
            'source_page' => 'api',
            'sync_status' => 'pending',
        ]);

        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response([
                'access_token' => 'new-access-token',
                'expires_in' => 3600,
                'token_type' => 'Bearer',
            ], 200),
            'https://www.googleapis.com/calendar/v3/calendars/primary/events*' => Http::response([
                'id' => 'event-refresh-123',
                'organizer' => ['email' => 'owner@factory23.test'],
                'hangoutLink' => 'https://meet.google.com/event-refresh-123',
                'htmlLink' => 'https://calendar.google.com/event?eid=456',
                'updated' => now()->toIso8601String(),
            ], 200),
        ]);

        app(MeetingSyncService::class)->syncMeeting((int) $meeting->id);

        $connection->refresh();
        $meeting->refresh();

        $this->assertSame('new-access-token', (string) $connection->access_token_encrypted);
        $this->assertSame('synced', $meeting->sync_status);
        $this->assertSame('event-refresh-123', $meeting->google_event_id);
    }

    public function test_cancel_meeting_sync_calls_google_delete_and_marks_synced(): void
    {
        [$company, $owner] = $this->seedCompanyUsers('FAC-SYNC004');

        CompanyCalendarConnection::create([
            'company_id' => $company->id,
            'owner_user_id' => $owner->id,
            'organizer_email' => 'owner@factory23.test',
            'organizer_google_user_id' => 'google-owner-123',
            'access_token_encrypted' => 'access-token',
            'refresh_token_encrypted' => 'refresh-token',
            'token_expires_at' => now()->addHour(),
            'scopes' => ['https://www.googleapis.com/auth/calendar'],
            'status' => 'active',
            'connected_at' => now(),
        ]);

        $meeting = Meeting::create([
            'company_id' => $company->id,
            'created_by_user_id' => $owner->id,
            'title' => 'Cancel Sync Meeting',
            'timezone' => 'Africa/Lagos',
            'start_at' => now()->addDays(4),
            'end_at' => now()->addDays(4)->addHour(),
            'status' => 'cancelled',
            'source_page' => 'api',
            'sync_status' => 'pending',
            'google_event_id' => 'event-cancel-123',
        ]);

        Http::fake([
            'https://www.googleapis.com/calendar/v3/calendars/primary/events/*' => Http::response([], 204),
        ]);

        app(MeetingSyncService::class)->cancelMeeting((int) $meeting->id);

        $meeting->refresh();

        $this->assertSame('synced', $meeting->sync_status);
        $this->assertNull($meeting->sync_error_message);
    }

    private function seedCompanyUsers(string $companyId): array
    {
        $company = Company::create([
            'company_id' => $companyId,
            'name' => 'Sync Company',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'operations',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $owner = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $owner->id,
            'role' => 'owner',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [$company, $owner];
    }
}
