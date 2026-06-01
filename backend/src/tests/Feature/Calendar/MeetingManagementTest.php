<?php

declare(strict_types=1);

namespace Tests\Feature\Calendar;

use App\Models\Company;
use App\Models\CompanyCalendarConnection;
use App\Models\Meeting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MeetingManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_cannot_create_meeting_when_calendar_not_connected(): void
    {
        [$company, $owner] = $this->seedCompanyUsers();

        $response = $this->withToken($owner->createToken('owner-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/meetings', [
                'company_id' => $company->company_id,
                'title' => 'Operations Planning Sync',
                'description' => 'Weekly planning sync for launch tasks.',
                'timezone' => 'Africa/Lagos',
                'start_at' => now()->addDay()->setHour(9)->setMinute(0)->toIso8601String(),
                'end_at' => now()->addDay()->setHour(10)->setMinute(0)->toIso8601String(),
                'source_page' => 'operations',
                'attendees' => [
                    ['email' => 'admin@factory23.test', 'display_name' => 'Ops Admin'],
                ],
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath('success', false)
            ->assertJsonPath(
                'errors.google_calendar.0',
                'Google Calendar has not been configured for this organization. Please contact your Account Administrator (Owner or Admin) to complete the Google Calendar setup before creating meetings.',
            );
    }

    public function test_owner_can_create_meeting_with_pending_sync_when_connection_active(): void
    {
        Http::fake([
            'https://www.googleapis.com/calendar/v3/calendars/*/events?conferenceDataVersion=1&sendUpdates=all' => Http::response([
                'id' => 'event-owner-123',
                'organizer' => ['email' => 'owner@factory23.test'],
                'hangoutLink' => 'https://meet.google.com/event-owner-123',
                'htmlLink' => 'https://calendar.google.com/event?eid=owner123',
                'updated' => now()->toIso8601String(),
            ], 200),
        ]);

        [$company, $owner] = $this->seedCompanyUsers();

        CompanyCalendarConnection::create([
            'company_id' => $company->id,
            'owner_user_id' => $owner->id,
            'organizer_email' => 'owner@factory23.test',
            'organizer_name' => 'Calendar Owner',
            'organizer_google_user_id' => 'google-owner-123',
            'access_token_encrypted' => 'access-token',
            'refresh_token_encrypted' => 'refresh-token',
            'token_expires_at' => now()->addHour(),
            'scopes' => ['https://www.googleapis.com/auth/calendar'],
            'status' => 'active',
            'connected_at' => now(),
        ]);

        $response = $this->withToken($owner->createToken('owner-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/meetings', [
                'company_id' => $company->company_id,
                'title' => 'Executive Review',
                'description' => 'Executive weekly review with stakeholders.',
                'timezone' => 'Africa/Lagos',
                'start_at' => now()->addDays(2)->setHour(11)->setMinute(0)->toIso8601String(),
                'end_at' => now()->addDays(2)->setHour(12)->setMinute(0)->toIso8601String(),
                'source_page' => 'dashboard',
                'attendees' => [
                    ['email' => 'admin@factory23.test', 'display_name' => 'Ops Admin'],
                ],
            ]);

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.meeting.sync_status', 'synced')
            ->assertJsonPath('data.meeting.organizer_email_snapshot', 'owner@factory23.test')
            ->assertJsonPath('data.meeting.organizer_name_snapshot', 'Calendar Owner')
            ->assertJsonPath('data.integration.connected', true)
            ->assertJsonPath('data.warnings', []);

        $meetingId = (int) $response->json('data.meeting.id');

        $this->assertDatabaseHas('meeting_attendees', [
            'meeting_id' => $meetingId,
            'email' => 'owner@factory23.test',
            'is_organizer' => true,
        ]);

        $this->assertNotNull($response->json('data.meeting.google_event_id'));
        $this->assertSame('primary', $response->json('data.meeting.google_calendar_id'));
        $this->assertSame('https://meet.google.com/event-owner-123', $response->json('data.meeting.google_meet_url'));
    }

    public function test_admin_can_create_meeting_with_connection_active(): void
    {
        Http::fake([
            'https://www.googleapis.com/calendar/v3/calendars/*/events?conferenceDataVersion=1&sendUpdates=all' => Http::response([
                'id' => 'event-admin-123',
                'organizer' => ['email' => 'owner@factory23.test'],
                'hangoutLink' => 'https://meet.google.com/event-admin-123',
                'htmlLink' => 'https://calendar.google.com/event?eid=admin123',
                'updated' => now()->toIso8601String(),
            ], 200),
        ]);

        [$company, $owner, $admin] = $this->seedCompanyUsers();

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

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/meetings', [
                'company_id' => $company->company_id,
                'title' => 'Admin Planning Review',
                'description' => 'Admin created planning review.',
                'timezone' => 'Africa/Lagos',
                'start_at' => now()->addDays(2)->setHour(11)->setMinute(0)->toIso8601String(),
                'end_at' => now()->addDays(2)->setHour(12)->setMinute(0)->toIso8601String(),
                'source_page' => 'dashboard',
            ]);

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.meeting.sync_status', 'synced')
            ->assertJsonPath('data.integration.connected', true);
    }

    public function test_supervisor_can_create_meeting_with_connection_active(): void
    {
        Http::fake([
            'https://www.googleapis.com/calendar/v3/calendars/*/events?conferenceDataVersion=1&sendUpdates=all' => Http::response([
                'id' => 'event-supervisor-123',
                'organizer' => ['email' => 'owner@factory23.test'],
                'hangoutLink' => 'https://meet.google.com/event-supervisor-123',
                'htmlLink' => 'https://calendar.google.com/event?eid=supervisor123',
                'updated' => now()->toIso8601String(),
            ], 200),
        ]);

        [$company, $owner, $admin] = $this->seedCompanyUsers();
        $supervisor = User::factory()->create(['email_verified_at' => now()]);

        $this->attachCompanyRole($company->id, $supervisor->id, 'supervisor');

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

        $response = $this->withToken($supervisor->createToken('supervisor-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/meetings', [
                'company_id' => $company->company_id,
                'title' => 'Supervisor Team Meeting',
                'description' => 'Supervisor created team meeting.',
                'timezone' => 'Africa/Lagos',
                'start_at' => now()->addDays(3)->setHour(14)->setMinute(0)->toIso8601String(),
                'end_at' => now()->addDays(3)->setHour(15)->setMinute(0)->toIso8601String(),
                'source_page' => 'operations',
            ]);

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.meeting.sync_status', 'synced')
            ->assertJsonPath('data.integration.connected', true);
    }

    public function test_agent_can_create_meeting_with_connection_active(): void
    {
        Http::fake([
            'https://www.googleapis.com/calendar/v3/calendars/*/events?conferenceDataVersion=1&sendUpdates=all' => Http::response([
                'id' => 'event-agent-123',
                'organizer' => ['email' => 'owner@factory23.test'],
                'hangoutLink' => 'https://meet.google.com/event-agent-123',
                'htmlLink' => 'https://calendar.google.com/event?eid=agent123',
                'updated' => now()->toIso8601String(),
            ], 200),
        ]);

        [$company, $owner, $admin, $agent] = $this->seedCompanyUsers();

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

        $response = $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/meetings', [
                'company_id' => $company->company_id,
                'title' => 'Agent Follow-up Call',
                'description' => 'Agent created follow-up meeting.',
                'timezone' => 'Africa/Lagos',
                'start_at' => now()->addDays(4)->setHour(10)->setMinute(0)->toIso8601String(),
                'end_at' => now()->addDays(4)->setHour(11)->setMinute(0)->toIso8601String(),
                'source_page' => 'agent',
            ]);

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.meeting.sync_status', 'synced')
            ->assertJsonPath('data.integration.connected', true);
    }

    public function test_owner_can_cancel_meeting_and_sync_google_cancel_when_connected(): void
    {
        Http::fake([
            'https://www.googleapis.com/calendar/v3/calendars/primary/events/event-123?sendUpdates=all' => Http::response([], 204),
        ]);

        [$company, $owner] = $this->seedCompanyUsers();

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
            'title' => 'Cancelable Meeting',
            'timezone' => 'Africa/Lagos',
            'start_at' => now()->addDays(2),
            'end_at' => now()->addDays(2)->addHour(),
            'status' => 'scheduled',
            'source_page' => 'api',
            'sync_status' => 'synced',
            'google_event_id' => 'event-123',
        ]);

        $response = $this->withToken($owner->createToken('owner-token', ['*'])->plainTextToken)
            ->deleteJson('/api/v1/meetings/' . $meeting->id, [
                'company_id' => $company->company_id,
            ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.meeting.status', 'cancelled')
            ->assertJsonPath('data.meeting.sync_status', 'synced');
    }

    public function test_agent_cannot_create_meeting_when_calendar_not_connected(): void
    {
        [$company,,, $agent] = $this->seedCompanyUsers();

        $response = $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/meetings', [
                'company_id' => $company->company_id,
                'title' => 'Agent Unauthorized Meeting',
                'timezone' => 'Africa/Lagos',
                'start_at' => now()->addDay()->toIso8601String(),
                'end_at' => now()->addDays(1)->addHour()->toIso8601String(),
                'source_page' => 'operations',
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath(
                'errors.google_calendar.0',
                'Google Calendar has not been configured for this organization. Please contact your Account Administrator (Owner or Admin) to complete the Google Calendar setup before creating meetings.',
            );
    }

    public function test_management_user_can_list_company_meetings(): void
    {
        [$company, $owner, $admin] = $this->seedCompanyUsers();

        Meeting::create([
            'company_id' => $company->id,
            'created_by_user_id' => $owner->id,
            'title' => 'Visible Meeting',
            'timezone' => 'Africa/Lagos',
            'start_at' => now()->addDay(),
            'end_at' => now()->addDay()->addHour(),
            'status' => 'scheduled',
            'source_page' => 'api',
            'sync_status' => 'pending_setup',
        ]);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/meetings?company_id=' . $company->company_id);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.title', 'Visible Meeting');
    }

    public function test_agent_can_list_company_meetings(): void
    {
        [$company, $owner, $admin, $agent] = $this->seedCompanyUsers();

        Meeting::create([
            'company_id' => $company->id,
            'created_by_user_id' => $owner->id,
            'title' => 'Visible Agent Meeting',
            'timezone' => 'Africa/Lagos',
            'start_at' => now()->addDay(),
            'end_at' => now()->addDay()->addHour(),
            'status' => 'scheduled',
            'source_page' => 'api',
            'sync_status' => 'pending',
        ]);

        $response = $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/meetings?company_id=' . $company->company_id);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.title', 'Visible Agent Meeting');
    }

    public function test_management_user_cannot_fetch_meeting_from_another_company(): void
    {
        [$companyOne, $ownerOne, $adminOne] = $this->seedCompanyUsers('FAC-MEET001');
        [$companyTwo, $ownerTwo] = $this->seedCompanyUsers('FAC-MEET002');

        $foreignMeeting = Meeting::create([
            'company_id' => $companyTwo->id,
            'created_by_user_id' => $ownerTwo->id,
            'title' => 'Foreign Meeting',
            'timezone' => 'Africa/Lagos',
            'start_at' => now()->addDays(3),
            'end_at' => now()->addDays(3)->addHour(),
            'status' => 'scheduled',
            'source_page' => 'api',
            'sync_status' => 'pending_setup',
        ]);

        $response = $this->withToken($adminOne->createToken('admin-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/meetings/' . $foreignMeeting->id . '?company_id=' . $companyOne->company_id);

        $response->assertUnprocessable()
            ->assertJsonPath('errors.meeting.0', 'Meeting does not belong to the active company context.');
    }

    public function test_management_user_can_fetch_all_company_attendee_candidates(): void
    {
        [$company, $owner, $admin, $agent] = $this->seedCompanyUsers();
        $supervisor = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $supervisor->id,
            'role' => 'supervisor',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/meetings/attendees?company_id=' . $company->company_id);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(4, 'data.items')
            ->assertJsonPath('data.items.0.company_role', 'owner')
            ->assertJsonPath('data.items.1.company_role', 'admin')
            ->assertJsonPath('data.items.2.company_role', 'supervisor')
            ->assertJsonPath('data.items.3.company_role', 'agent');
    }

    public function test_meeting_delete_uses_soft_delete_when_configured(): void
    {
        config()->set('meetings.deletion_mode', 'soft');

        [$company, $owner] = $this->seedCompanyUsers();

        $meeting = Meeting::create([
            'company_id' => $company->id,
            'created_by_user_id' => $owner->id,
            'title' => 'Soft Delete Meeting',
            'timezone' => 'Africa/Lagos',
            'start_at' => now()->addDays(2),
            'end_at' => now()->addDays(2)->addHour(),
            'status' => 'scheduled',
            'source_page' => 'api',
            'sync_status' => 'pending_setup',
        ]);

        $this->withToken($owner->createToken('owner-token', ['*'])->plainTextToken)
            ->deleteJson('/api/v1/meetings/' . $meeting->id, [
                'company_id' => $company->company_id,
            ])
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertSoftDeleted('meetings', ['id' => $meeting->id]);
    }

    public function test_meeting_delete_uses_force_delete_in_hard_mode(): void
    {
        config()->set('meetings.deletion_mode', 'hard');

        [$company, $owner] = $this->seedCompanyUsers();

        $meeting = Meeting::create([
            'company_id' => $company->id,
            'created_by_user_id' => $owner->id,
            'title' => 'Hard Delete Meeting',
            'timezone' => 'Africa/Lagos',
            'start_at' => now()->addDays(2),
            'end_at' => now()->addDays(2)->addHour(),
            'status' => 'scheduled',
            'source_page' => 'api',
            'sync_status' => 'pending_setup',
        ]);

        $this->withToken($owner->createToken('owner-token', ['*'])->plainTextToken)
            ->deleteJson('/api/v1/meetings/' . $meeting->id, [
                'company_id' => $company->company_id,
            ])
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertDatabaseMissing('meetings', ['id' => $meeting->id]);
    }

    private function seedCompanyUsers(string $companyId = 'FAC-MEETBASE'): array
    {
        $company = Company::create([
            'company_id' => $companyId,
            'name' => 'Meeting Company',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'operations',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $owner = User::factory()->create(['email_verified_at' => now()]);
        $admin = User::factory()->create(['email_verified_at' => now()]);
        $agent = User::factory()->create(['email_verified_at' => now()]);

        $this->attachCompanyRole($company->id, $owner->id, 'owner');
        $this->attachCompanyRole($company->id, $admin->id, 'admin');
        $this->attachCompanyRole($company->id, $agent->id, 'agent');

        return [$company, $owner, $admin, $agent];
    }

    private function attachCompanyRole(int $companyId, int $userId, string $role): void
    {
        DB::table('company_users')->insert([
            'company_id' => $companyId,
            'user_id' => $userId,
            'role' => $role,
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
