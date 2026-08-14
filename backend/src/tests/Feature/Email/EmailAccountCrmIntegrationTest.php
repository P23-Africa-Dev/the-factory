<?php

declare(strict_types=1);

namespace Tests\Feature\Email;

use App\Enums\CrmEmailStatus;
use App\Jobs\SendCrmEmailJob;
use App\Models\Company;
use App\Models\CrmEmailMessage;
use App\Models\EmailAccount;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class EmailAccountCrmIntegrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_send_email_using_email_account(): void
    {
        Bus::fake();

        [$company, $admin, $pipelineId] = $this->seedCompanyWithAdminAndPipeline();
        $this->seedEmailAccount($company, $admin, 'google', 'admin@gmail.com');

        $lead = Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'name' => 'Acme Corp',
            'email' => 'client@example.com',
            'status' => 'new',
            'priority' => 'medium',
        ]);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/admin/crm/leads/' . $lead->id . '/emails/send', [
                'company_id' => $company->id,
                'to' => [['email' => 'client@example.com', 'name' => 'Acme Corp']],
                'cc' => [['email' => 'manager@example.com', 'name' => 'Manager']],
                'subject' => 'Follow up on proposal',
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

    public function test_send_email_requires_active_email_account(): void
    {
        [$company, $admin, $pipelineId] = $this->seedCompanyWithAdminAndPipeline();

        // Create a disconnected account — should not be usable
        EmailAccount::query()->create([
            'company_id' => $company->id,
            'user_id' => $admin->id,
            'provider' => 'google',
            'email' => 'admin@gmail.com',
            'access_token_encrypted' => 'token',
            'status' => 'disconnected',
            'connected_at' => now(),
            'disconnected_at' => now(),
        ]);

        $lead = Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'name' => 'Acme Corp',
            'email' => 'client@example.com',
            'status' => 'new',
            'priority' => 'medium',
        ]);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/admin/crm/leads/' . $lead->id . '/emails/send', [
                'company_id' => $company->id,
                'to' => [['email' => 'client@example.com']],
                'subject' => 'Test',
                'body_text' => 'Test body.',
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath('success', false);
    }

    public function test_admin_can_send_email_with_specific_sender_account(): void
    {
        Bus::fake();

        [$company, $admin, $pipelineId] = $this->seedCompanyWithAdminAndPipeline();

        $account1 = $this->seedEmailAccount($company, $admin, 'google', 'primary@gmail.com', true);
        $account2 = $this->seedEmailAccount($company, $admin, 'microsoft', 'secondary@outlook.com', false);

        $lead = Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'name' => 'Acme Corp',
            'email' => 'client@example.com',
            'status' => 'new',
            'priority' => 'medium',
        ]);

        // Send using the secondary (non-default) account
        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/admin/crm/leads/' . $lead->id . '/emails/send', [
                'company_id' => $company->id,
                'to' => [['email' => 'client@example.com']],
                'subject' => 'From Outlook',
                'body_text' => 'Sent via Microsoft.',
                'email_account_id' => $account2->id,
            ]);

        $response->assertAccepted()
            ->assertJsonPath('success', true);

        $this->assertDatabaseHas('crm_email_messages', [
            'lead_id' => $lead->id,
            'gmail_account_email' => 'secondary@outlook.com',
        ]);
    }

    public function test_admin_can_trash_email_message_with_email_account(): void
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

        [$company, $admin, $pipelineId] = $this->seedCompanyWithAdminAndPipeline();
        $this->seedEmailAccount($company, $admin, 'google', 'admin@gmail.com');

        $lead = Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'name' => 'Acme Corp',
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
    }

    public function test_agent_cannot_send_email_for_unassigned_lead(): void
    {
        [$company, $admin, $agent, $pipelineId] = $this->seedCompanyWithAdminAgentAndPipeline();
        $this->seedEmailAccount($company, $agent, 'google', 'agent@gmail.com');

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
                'body_text' => 'This should be blocked.',
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath('success', false);
    }

    public function test_email_activity_is_logged_when_sending(): void
    {
        Bus::fake();

        [$company, $admin, $pipelineId] = $this->seedCompanyWithAdminAndPipeline();
        $this->seedEmailAccount($company, $admin, 'google', 'admin@gmail.com');

        $lead = Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'name' => 'Activity Lead',
            'email' => 'activity@example.com',
            'status' => 'new',
            'priority' => 'medium',
        ]);

        $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/admin/crm/leads/' . $lead->id . '/emails/send', [
                'company_id' => $company->id,
                'to' => [['email' => 'activity@example.com']],
                'subject' => 'Activity Test',
                'body_text' => 'Testing activity logging.',
            ]);

        $this->assertDatabaseHas('crm_email_activity_logs', [
            'company_id' => $company->id,
            'lead_id' => $lead->id,
            'user_id' => $admin->id,
            'action' => 'send_queued',
        ]);
    }

    public function test_email_activity_is_logged_when_marking_as_read(): void
    {
        [$company, $admin, $pipelineId] = $this->seedCompanyWithAdminAndPipeline();
        $this->seedEmailAccount($company, $admin, 'google', 'admin@gmail.com');

        $lead = Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'name' => 'Read Test Lead',
            'email' => 'read@example.com',
            'status' => 'new',
            'priority' => 'medium',
        ]);

        $thread = \App\Models\CrmEmailThread::query()->create([
            'company_id' => $company->id,
            'lead_id' => $lead->id,
            'gmail_thread_id' => 'thread-read',
            'subject' => 'Read me',
            'snippet' => 'Please read',
            'last_message_at' => now(),
            'unread_count' => 1,
            'message_count' => 1,
            'participant_emails' => ['read@example.com', 'admin@gmail.com'],
        ]);

        $message = CrmEmailMessage::query()->create([
            'company_id' => $company->id,
            'thread_id' => $thread->id,
            'lead_id' => $lead->id,
            'gmail_message_id' => 'gmail-read-1',
            'gmail_thread_id' => 'thread-read',
            'direction' => \App\Enums\CrmEmailDirection::Received,
            'status' => CrmEmailStatus::Sent,
            'from_email' => 'read@example.com',
            'to_recipients' => [['email' => 'admin@gmail.com']],
            'subject' => 'Mark me',
            'body_text' => 'Please read me.',
            'is_read' => false,
            'is_starred' => false,
            'gmail_account_email' => 'admin@gmail.com',
            'received_at' => now(),
        ]);

        $this->withToken($admin->createToken('Token', ['*'])->plainTextToken)
            ->patchJson('/api/v1/admin/crm/leads/' . $lead->id . '/emails/messages/' . $message->id . '/read', [
                'company_id' => $company->id,
            ]);

        $this->assertDatabaseHas('crm_email_activity_logs', [
            'company_id' => $company->id,
            'lead_id' => $lead->id,
            'user_id' => $admin->id,
            'action' => 'mark_read',
        ]);
    }

    private function seedCompanyWithAdminAndPipeline(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-CRM001',
            'name' => 'CRM Email Integration Factory',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'CRM email integration testing',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $admin = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $admin->id,
            'role' => 'admin',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $pipeline = LeadPipeline::query()->create([
            'company_id' => $company->id,
            'name' => 'Default Pipeline',
            'currency_code' => 'USD',
            'sort_order' => 0,
            'is_default' => true,
        ]);

        return [$company, $admin, $pipeline->id];
    }

    private function seedCompanyWithAdminAgentAndPipeline(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-CRM002',
            'name' => 'CRM Multi-User Factory',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'CRM email multi-user testing',
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

    private function seedEmailAccount(Company $company, User $user, string $provider, string $email, bool $isDefault = true): EmailAccount
    {
        return EmailAccount::query()->create([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'provider' => $provider,
            'email' => $email,
            'display_name' => $email,
            'access_token_encrypted' => 'encrypted-access-token',
            'refresh_token_encrypted' => 'encrypted-refresh-token',
            'token_expires_at' => now()->addHour(),
            'scopes' => ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.modify'],
            'is_default' => $isDefault,
            'status' => 'active',
            'connected_at' => now(),
        ]);
    }
}
