<?php

declare(strict_types=1);

namespace Tests\Feature\Calendar;

use App\Jobs\SendMeetingLifecycleEmailJob;
use App\Models\Company;
use App\Models\CompanyCalendarConnection;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\Meeting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class MeetingManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Lifecycle emails are validated in dedicated email tests; keep meeting tests network-isolated.
        Queue::fake([SendMeetingLifecycleEmailJob::class]);
    }

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
                'Google Calendar has not been configured for your account. Please connect your Google Calendar before creating meetings.',
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
        $owner->forceFill(['email' => 'emmanuel@factory23.test', 'name' => 'Emmanuel'])->save();

        CompanyCalendarConnection::create([
            'company_id' => $company->id,
            'owner_user_id' => $owner->id,
            'organizer_email' => 'mike@gmail.com',
            'organizer_name' => 'Mike Calendar',
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
            ->assertJsonPath('data.meeting.organizer_email_snapshot', 'emmanuel@factory23.test')
            ->assertJsonPath('data.meeting.organizer_name_snapshot', 'Emmanuel')
            ->assertJsonPath('data.meeting.google_calendar_owner_email', 'mike@gmail.com')
            ->assertJsonPath('data.integration.connected', true)
            ->assertJsonPath('data.integration.google_calendar_owner_email', 'mike@gmail.com');

        $warnings = $response->json('data.warnings');
        $this->assertIsArray($warnings);
        $this->assertSame([], $warnings);

        Http::assertSent(static function ($request): bool {
            if (! str_contains($request->url(), 'https://www.googleapis.com/calendar/v3/calendars/')) {
                return false;
            }

            if (! str_contains($request->url(), '/events?conferenceDataVersion=1&sendUpdates=all')) {
                return false;
            }

            $payload = $request->data();
            $attendeeEmails = collect($payload['attendees'] ?? [])
                ->pluck('email')
                ->map(static fn($email): string => strtolower((string) $email))
                ->all();

            return ($payload['start']['timeZone'] ?? null) === 'Africa/Lagos'
                && ($payload['end']['timeZone'] ?? null) === 'Africa/Lagos'
                && ! in_array('emmanuel@factory23.test', $attendeeEmails, true)
                && ! in_array('mike@gmail.com', $attendeeEmails, true)
                && in_array('admin@factory23.test', $attendeeEmails, true);
        });

        $meetingId = (int) $response->json('data.meeting.id');

        $this->assertDatabaseHas('meeting_attendees', [
            'meeting_id' => $meetingId,
            'email' => 'emmanuel@factory23.test',
            'user_id' => $owner->id,
            'is_organizer' => true,
        ]);

        $this->assertDatabaseMissing('meeting_attendees', [
            'meeting_id' => $meetingId,
            'email' => 'mike@gmail.com',
        ]);

        $this->assertNotNull($response->json('data.meeting.google_event_id'));
        $this->assertSame('primary', $response->json('data.meeting.google_calendar_id'));
        $this->assertSame('https://meet.google.com/event-owner-123', $response->json('data.meeting.google_meet_url'));
    }

    public function test_creator_is_auto_included_as_organizer_when_personal_google_email_differs(): void
    {
        Http::fake([
            'https://www.googleapis.com/calendar/v3/calendars/*/events?conferenceDataVersion=1&sendUpdates=all' => Http::response([
                'id' => 'event-personal-456',
                'organizer' => ['email' => 'mike@gmail.com'],
                'hangoutLink' => 'https://meet.google.com/event-personal-456',
                'htmlLink' => 'https://calendar.google.com/event?eid=personal456',
                'updated' => now()->toIso8601String(),
            ], 200),
        ]);

        [$company, $owner] = $this->seedCompanyUsers('FAC-MEETDIFF');
        $owner->forceFill(['email' => 'emmanuel@factory23.test', 'name' => 'Emmanuel'])->save();

        \App\Models\UserCalendarConnection::create([
            'company_id' => $company->id,
            'user_id' => $owner->id,
            'organizer_email' => 'mike@gmail.com',
            'organizer_name' => 'Mike Gmail',
            'organizer_google_user_id' => 'google-mike-456',
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
                'title' => 'Client Kickoff',
                'timezone' => 'UTC',
                'start_at' => now()->addDay()->setHour(14)->setMinute(0)->toIso8601String(),
                'end_at' => now()->addDay()->setHour(15)->setMinute(0)->toIso8601String(),
                'source_page' => 'operations',
                'attendees' => [],
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.meeting.sync_status', 'synced')
            ->assertJsonPath('data.meeting.organizer_email_snapshot', 'emmanuel@factory23.test');

        $meetingId = (int) $response->json('data.meeting.id');

        $this->assertDatabaseHas('meeting_attendees', [
            'meeting_id' => $meetingId,
            'email' => 'emmanuel@factory23.test',
            'user_id' => $owner->id,
            'is_organizer' => true,
        ]);

        $this->assertDatabaseMissing('meeting_attendees', [
            'meeting_id' => $meetingId,
            'email' => 'mike@gmail.com',
        ]);
    }

    public function test_explicit_google_host_email_receives_google_invite(): void
    {
        Http::fake([
            'https://www.googleapis.com/calendar/v3/calendars/*/events?conferenceDataVersion=1&sendUpdates=all' => Http::response([
                'id' => 'event-explicit-host',
                'organizer' => ['email' => 'mike@gmail.com'],
                'hangoutLink' => 'https://meet.google.com/event-explicit-host',
                'htmlLink' => 'https://calendar.google.com/event?eid=explicithost',
                'updated' => now()->toIso8601String(),
            ], 200),
        ]);

        [$company, $owner] = $this->seedCompanyUsers('FAC-MEETHOST');
        $owner->forceFill(['email' => 'emmanuel@factory23.test', 'name' => 'Emmanuel'])->save();

        \App\Models\UserCalendarConnection::create([
            'company_id' => $company->id,
            'user_id' => $owner->id,
            'organizer_email' => 'mike@gmail.com',
            'organizer_name' => 'Mike Gmail',
            'organizer_google_user_id' => 'google-mike-host',
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
                'title' => 'Invite Host Explicitly',
                'timezone' => 'UTC',
                'start_at' => now()->addDay()->setHour(14)->setMinute(0)->toIso8601String(),
                'end_at' => now()->addDay()->setHour(15)->setMinute(0)->toIso8601String(),
                'source_page' => 'operations',
                'attendees' => [
                    ['email' => 'mike@gmail.com', 'display_name' => 'Mike'],
                ],
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.meeting.sync_status', 'synced');

        Http::assertSent(static function ($request): bool {
            if (! str_contains($request->url(), '/events?conferenceDataVersion=1&sendUpdates=all')) {
                return false;
            }

            $attendeeEmails = collect($request->data()['attendees'] ?? [])
                ->pluck('email')
                ->map(static fn($email): string => strtolower((string) $email))
                ->all();

            return in_array('mike@gmail.com', $attendeeEmails, true)
                && ! in_array('emmanuel@factory23.test', $attendeeEmails, true);
        });
    }

    public function test_owner_can_create_meeting_with_lead_ids(): void
    {
        Http::fake([
            'https://www.googleapis.com/calendar/v3/calendars/*/events?conferenceDataVersion=1&sendUpdates=all' => Http::response([
                'id' => 'event-lead-123',
                'organizer' => ['email' => 'owner@factory23.test'],
                'hangoutLink' => 'https://meet.google.com/event-lead-123',
                'htmlLink' => 'https://calendar.google.com/event?eid=lead123',
                'updated' => now()->toIso8601String(),
            ], 200),
        ]);

        [$company, $owner] = $this->seedCompanyUsers();
        $pipelineId = $this->seedLeadPipeline($company->id);

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

        $leadWithEmail = Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $owner->id,
            'name' => 'Prospect With Email',
            'email' => 'prospect@example.com',
            'status' => 'newly_lead',
            'priority' => 'medium',
        ]);

        $leadWithoutEmail = Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $owner->id,
            'name' => 'Prospect Without Email',
            'phone' => '+2348000000001',
            'status' => 'newly_lead',
            'priority' => 'medium',
        ]);

        $response = $this->withToken($owner->createToken('owner-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/meetings', [
                'company_id' => $company->company_id,
                'title' => 'Lead Discovery Call',
                'description' => 'Intro call with CRM leads.',
                'timezone' => 'Africa/Lagos',
                'start_at' => now()->addDays(2)->setHour(11)->setMinute(0)->toIso8601String(),
                'end_at' => now()->addDays(2)->setHour(12)->setMinute(0)->toIso8601String(),
                'source_page' => 'operations',
                'lead_ids' => [$leadWithEmail->id, $leadWithoutEmail->id],
            ]);

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonCount(2, 'data.meeting.leads');

        $response->assertJsonFragment([
            'id' => $leadWithEmail->id,
            'name' => 'Prospect With Email',
            'email' => 'prospect@example.com',
        ]);
        $response->assertJsonFragment([
            'id' => $leadWithoutEmail->id,
            'name' => 'Prospect Without Email',
        ]);

        $meetingId = (int) $response->json('data.meeting.id');

        $this->assertDatabaseHas('meeting_leads', [
            'meeting_id' => $meetingId,
            'lead_id' => $leadWithEmail->id,
        ]);
        $this->assertDatabaseHas('meeting_leads', [
            'meeting_id' => $meetingId,
            'lead_id' => $leadWithoutEmail->id,
        ]);
        $this->assertDatabaseHas('meeting_attendees', [
            'meeting_id' => $meetingId,
            'lead_id' => $leadWithEmail->id,
            'email' => 'prospect@example.com',
        ]);
        $this->assertDatabaseMissing('meeting_attendees', [
            'meeting_id' => $meetingId,
            'lead_id' => $leadWithoutEmail->id,
        ]);
    }

    public function test_owner_cannot_create_meeting_with_foreign_lead_ids(): void
    {
        [$companyOne, $ownerOne] = $this->seedCompanyUsers('FAC-MEETLEAD1');
        [$companyTwo, $ownerTwo] = $this->seedCompanyUsers('FAC-MEETLEAD2');
        $foreignPipelineId = $this->seedLeadPipeline($companyTwo->id);

        CompanyCalendarConnection::create([
            'company_id' => $companyOne->id,
            'owner_user_id' => $ownerOne->id,
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

        $foreignLead = Lead::create([
            'company_id' => $companyTwo->id,
            'pipeline_id' => $foreignPipelineId,
            'created_by_user_id' => $ownerTwo->id,
            'name' => 'Foreign Lead',
            'email' => 'foreign@example.com',
            'status' => 'newly_lead',
            'priority' => 'medium',
        ]);

        $response = $this->withToken($ownerOne->createToken('owner-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/meetings', [
                'company_id' => $companyOne->company_id,
                'title' => 'Invalid Lead Meeting',
                'description' => 'Should fail lead validation.',
                'timezone' => 'Africa/Lagos',
                'start_at' => now()->addDay()->setHour(9)->setMinute(0)->toIso8601String(),
                'end_at' => now()->addDay()->setHour(10)->setMinute(0)->toIso8601String(),
                'source_page' => 'operations',
                'lead_ids' => [$foreignLead->id],
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath('errors.lead_ids.0', 'One or more selected leads are invalid for this company.');
    }

    public function test_owner_cannot_create_meeting_with_invalid_timezone(): void
    {
        [$company, $owner] = $this->seedCompanyUsers();

        $response = $this->withToken($owner->createToken('owner-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/meetings', [
                'company_id' => $company->company_id,
                'title' => 'Invalid Timezone Meeting',
                'description' => 'Should fail validation',
                'timezone' => 'Africa/Lagoss',
                'start_at' => now()->addDay()->setHour(9)->setMinute(0)->toIso8601String(),
                'end_at' => now()->addDay()->setHour(10)->setMinute(0)->toIso8601String(),
                'source_page' => 'operations',
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath('success', false)
            ->assertJsonPath('errors.timezone.0', 'The timezone field must be a valid timezone.');
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
            ->postJson('/api/v1/meetings/' . $meeting->id . '/cancel', [
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
                'Google Calendar has not been configured for your account. Please connect your Google Calendar before creating meetings.',
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
            'created_by_user_id' => $agent->id,
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

    private function seedLeadPipeline(int $companyId): int
    {
        return (int) LeadPipeline::query()->create([
            'company_id' => $companyId,
            'name' => 'Default Pipeline',
            'currency_code' => 'USD',
            'sort_order' => 0,
            'is_default' => true,
        ])->id;
    }
}
