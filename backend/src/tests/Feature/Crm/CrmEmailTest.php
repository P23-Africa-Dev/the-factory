<?php

declare(strict_types=1);

namespace Tests\Feature\Crm;

use App\Enums\CrmEmailStatus;
use App\Jobs\SendCrmEmailJob;
use App\Models\Company;
use App\Models\CompanyCalendarConnection;
use App\Models\CrmEmailMessage;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\User;
use App\Models\UserCalendarConnection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CrmEmailTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_queue_send_email_for_lead(): void
    {
        Bus::fake();

        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();
        $this->seedGmailConnection($company, $admin);
        $this->seedUserGmailConnection($company, $admin, 'admin@gmail.com');

        $lead = Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'name' => 'Acme Ltd',
            'email' => 'client@example.com',
            'status' => 'new',
            'priority' => 'medium',
        ]);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/admin/crm/leads/' . $lead->id . '/emails/send', [
                'company_id' => $company->id,
                'to' => [['email' => 'client@example.com', 'name' => 'Acme Ltd']],
                'cc' => [['email' => 'manager@example.com', 'name' => 'Manager']],
                'subject' => 'Follow up',
                'body_text' => 'Hello, following up on our conversation.',
            ]);

        $response->assertAccepted()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.message.status', CrmEmailStatus::Sending->value);

        $messageId = (int) $response->json('data.message.id');
        $this->assertDatabaseHas('crm_email_messages', [
            'id' => $messageId,
            'lead_id' => $lead->id,
            'status' => CrmEmailStatus::Sending->value,
        ]);

        Bus::assertDispatched(SendCrmEmailJob::class);
    }

    public function test_admin_can_trash_lead_email_message(): void
    {
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response([
                'access_token' => 'fresh-access-token',
                'expires_in' => 3600,
                'token_type' => 'Bearer',
            ], 200),
            'https://www.googleapis.com/gmail/v1/users/me/messages/*/trash' => Http::response([
                'id' => 'gmail-msg-1',
                'labelIds' => ['TRASH'],
            ], 200),
        ]);

        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();
        $this->seedUserGmailConnection($company, $admin, 'admin@gmail.com');

        $lead = Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'name' => 'Acme Ltd',
            'email' => 'client@example.com',
            'status' => 'new',
            'priority' => 'medium',
        ]);

        $thread = \App\Models\CrmEmailThread::query()->create([
            'company_id' => $company->id,
            'lead_id' => $lead->id,
            'gmail_thread_id' => 'thread-1',
            'subject' => 'Follow up',
            'snippet' => 'Hello',
            'last_message_at' => now(),
            'unread_count' => 0,
            'message_count' => 1,
            'participant_emails' => ['client@example.com', 'admin@gmail.com'],
        ]);

        $message = CrmEmailMessage::query()->create([
            'company_id' => $company->id,
            'thread_id' => $thread->id,
            'lead_id' => $lead->id,
            'gmail_message_id' => 'gmail-msg-1',
            'gmail_thread_id' => 'thread-1',
            'direction' => \App\Enums\CrmEmailDirection::Sent,
            'status' => CrmEmailStatus::Sent,
            'from_email' => 'admin@gmail.com',
            'to_recipients' => [['email' => 'client@example.com']],
            'subject' => 'Follow up',
            'body_text' => 'Hello',
            'is_read' => true,
            'is_starred' => false,
            'gmail_account_email' => 'admin@gmail.com',
            'sent_at' => now(),
        ]);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->deleteJson('/api/v1/admin/crm/leads/' . $lead->id . '/emails/messages/' . $message->id, [
                'company_id' => $company->id,
            ]);

        $response->assertOk()->assertJsonPath('success', true);
        $this->assertSoftDeleted('crm_email_messages', ['id' => $message->id]);
        $this->assertDatabaseHas('crm_email_threads', [
            'id' => $thread->id,
            'message_count' => 0,
        ]);
    }

    public function test_agent_cannot_send_email_for_unassigned_lead(): void
    {
        [$company, $admin, $agent, $pipelineId] = $this->seedCompanyUsers();
        $this->seedGmailConnection($company, $admin);
        $this->seedUserGmailConnection($company, $agent, 'agent@gmail.com');

        $lead = Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'assigned_to_user_id' => $admin->id,
            'name' => 'Restricted Lead',
            'email' => 'restricted@example.com',
            'status' => 'new',
            'priority' => 'medium',
        ]);

        $response = $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/agent/crm/leads/' . $lead->id . '/emails/send', [
                'company_id' => $company->id,
                'to' => [['email' => 'restricted@example.com']],
                'subject' => 'Hello',
                'body_text' => 'This should be blocked for this agent.',
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath('success', false);
    }

    public function test_list_lead_emails_requires_gmail_connection(): void
    {
        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();

        $lead = Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'name' => 'No Gmail Lead',
            'email' => 'nogmail@example.com',
            'status' => 'new',
            'priority' => 'medium',
        ]);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/admin/crm/leads/' . $lead->id . '/emails?company_id=' . $company->id);

        $response->assertOk()
            ->assertJsonPath('success', true);
    }

    public function test_send_email_requires_personal_google_connection_even_if_company_connection_exists(): void
    {
        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();
        $this->seedGmailConnection($company, $admin);

        $lead = Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'name' => 'Needs Personal Gmail',
            'email' => 'lead@example.com',
            'status' => 'new',
            'priority' => 'medium',
        ]);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/admin/crm/leads/' . $lead->id . '/emails/send', [
                'company_id' => $company->id,
                'to' => [['email' => 'lead@example.com']],
                'subject' => 'Follow up',
                'body_text' => 'Checking in.',
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath(
                'errors.integration.0',
                'Google account is not connected. Connect your Google account to send and receive CRM emails.',
            );
    }

    public function test_calendar_status_includes_gmail_flags(): void
    {
        [$company, $admin] = $this->seedCompanyUsers();
        $this->seedGmailConnection($company, $admin);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/calendar/integration/status?company_id=' . $company->id);

        $response->assertOk()
            ->assertJsonPath('data.gmail_enabled', true)
            ->assertJsonPath('data.requires_gmail_reconnect', false);
    }

    private function seedCompanyUsers(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-EMAIL001',
            'name' => 'Email Factory Ltd',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'CRM email',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $admin = User::factory()->create(['email_verified_at' => now()]);
        $agent = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            [
                'company_id' => $company->id,
                'user_id' => $admin->id,
                'role' => 'admin',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'company_id' => $company->id,
                'user_id' => $agent->id,
                'role' => 'agent',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $pipeline = LeadPipeline::query()->create([
            'company_id' => $company->id,
            'name' => 'Default Pipeline',
            'currency_code' => 'USD',
            'sort_order' => 0,
            'is_default' => true,
        ]);

        return [$company, $admin, $agent, $pipeline->id];
    }

    private function seedGmailConnection(Company $company, User $owner): void
    {
        CompanyCalendarConnection::query()->create([
            'company_id' => $company->id,
            'owner_user_id' => $owner->id,
            'organizer_email' => 'owner@gmail.com',
            'organizer_name' => 'Owner',
            'organizer_google_user_id' => 'google-user',
            'access_token_encrypted' => 'access-token',
            'refresh_token_encrypted' => 'refresh-token',
            'token_expires_at' => now()->addHour(),
            'scopes' => [
                'https://www.googleapis.com/auth/gmail.send',
                'https://www.googleapis.com/auth/gmail.modify',
            ],
            'status' => 'active',
            'connected_at' => now(),
        ]);
    }

    private function seedUserGmailConnection(Company $company, User $user, string $email): void
    {
        UserCalendarConnection::query()->create([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'organizer_email' => $email,
            'organizer_name' => 'User Mailbox',
            'organizer_google_user_id' => 'google-user-' . $user->id,
            'access_token_encrypted' => 'user-access-token',
            'refresh_token_encrypted' => 'user-refresh-token',
            'token_expires_at' => now()->addHour(),
            'scopes' => [
                'https://www.googleapis.com/auth/gmail.send',
                'https://www.googleapis.com/auth/gmail.modify',
            ],
            'status' => 'active',
            'connected_at' => now(),
        ]);
    }
}
