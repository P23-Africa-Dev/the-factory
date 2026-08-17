<?php

declare(strict_types=1);

namespace Tests\Feature\Crm;

use App\Enums\CrmEmailStatus;
use App\Jobs\SendCrmEmailJob;
use App\Models\Company;
use App\Models\CompanyCalendarConnection;
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

class CrmEmailTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_queue_send_email_for_lead(): void
    {
        Bus::fake();

        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();
        $this->seedEmailAccount($company, $admin, 'admin@gmail.com');

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
        $this->seedEmailAccount($company, $admin, 'admin@gmail.com');

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
    }

    public function test_send_without_email_account_fails_clearly(): void
    {
        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();

        $lead = Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'name' => 'No Mail Lead',
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

        $response->assertUnprocessable();
        $this->assertTrue(
            str_contains(
                strtolower((string) $response->json('errors.email_account_id.0')
                    ?? (string) $response->json('errors.integration.0')
                    ?? ''),
                'email account',
            ),
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

    public function test_admin_can_manage_gmail_mailbox_actions_for_lead_email(): void
    {
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response([
                'access_token' => 'fresh-access-token',
                'expires_in' => 3600,
                'token_type' => 'Bearer',
            ], 200),
            'https://www.googleapis.com/gmail/v1/users/me/labels' => Http::sequence()
                ->push([
                    'labels' => [
                        ['id' => 'INBOX', 'name' => 'INBOX', 'type' => 'system'],
                        ['id' => 'Label_1', 'name' => 'Follow Up', 'type' => 'user'],
                    ],
                ], 200)
                ->push([
                    'id' => 'Label_2',
                    'name' => 'Hot Lead',
                    'type' => 'user',
                    'labelListVisibility' => 'labelShow',
                    'messageListVisibility' => 'show',
                ], 200),
            'https://www.googleapis.com/gmail/v1/users/me/labels/*' => Http::sequence()
                ->push([
                    'id' => 'Label_2',
                    'name' => 'Hot Lead Updated',
                    'type' => 'user',
                ], 200)
                ->push([], 204),
            'https://www.googleapis.com/gmail/v1/users/me/messages/*/modify' => Http::response([
                'id' => 'gmail-msg-2',
                'labelIds' => ['INBOX', 'UNREAD', 'Label_1'],
            ], 200),
            'https://www.googleapis.com/gmail/v1/users/me/messages/*/untrash' => Http::response([
                'id' => 'gmail-msg-2',
                'labelIds' => ['INBOX'],
            ], 200),
        ]);

        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();
        $this->seedEmailAccount($company, $admin, 'admin@gmail.com');

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
            'gmail_thread_id' => 'thread-2',
            'subject' => 'Proposal',
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
            'gmail_message_id' => 'gmail-msg-2',
            'gmail_thread_id' => 'thread-2',
            'direction' => \App\Enums\CrmEmailDirection::Received,
            'status' => CrmEmailStatus::Delivered,
            'from_email' => 'client@example.com',
            'to_recipients' => [['email' => 'admin@gmail.com']],
            'subject' => 'Proposal',
            'body_text' => 'Hello',
            'is_read' => true,
            'is_starred' => false,
            'gmail_account_email' => 'admin@gmail.com',
            'received_at' => now(),
        ]);

        $token = $admin->createToken('admin-token', ['*'])->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/admin/crm/emails/gmail/labels?company_id=' . $company->id)
            ->assertOk()
            ->assertJsonPath('data.items.1.id', 'Label_1');

        $this->withToken($token)
            ->postJson('/api/v1/admin/crm/emails/gmail/labels', [
                'company_id' => $company->id,
                'name' => 'Hot Lead',
            ])
            ->assertCreated()
            ->assertJsonPath('data.label.id', 'Label_2');

        $this->withToken($token)
            ->patchJson('/api/v1/admin/crm/emails/gmail/labels/Label_2', [
                'company_id' => $company->id,
                'name' => 'Hot Lead Updated',
            ])
            ->assertOk()
            ->assertJsonPath('data.label.name', 'Hot Lead Updated');

        $this->withToken($token)
            ->deleteJson('/api/v1/admin/crm/emails/gmail/labels/Label_2?company_id=' . $company->id)
            ->assertOk();

        $this->withToken($token)
            ->patchJson('/api/v1/admin/crm/leads/' . $lead->id . '/emails/messages/' . $message->id . '/unread', [
                'company_id' => $company->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.message.is_read', false);

        $this->withToken($token)
            ->postJson('/api/v1/admin/crm/leads/' . $lead->id . '/emails/messages/' . $message->id . '/move', [
                'company_id' => $company->id,
                'destination' => 'inbox',
            ])
            ->assertOk();

        $this->withToken($token)
            ->postJson('/api/v1/admin/crm/leads/' . $lead->id . '/emails/messages/' . $message->id . '/move', [
                'company_id' => $company->id,
                'destination' => 'spam',
            ])
            ->assertOk();

        $this->withToken($token)
            ->postJson('/api/v1/admin/crm/leads/' . $lead->id . '/emails/messages/' . $message->id . '/labels', [
                'company_id' => $company->id,
                'add' => ['Label_1'],
            ])
            ->assertOk()
            ->assertJsonPath('data.label_ids.2', 'Label_1');
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

    private function seedEmailAccount(Company $company, User $user, string $email): EmailAccount
    {
        return EmailAccount::query()->create([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'provider' => 'google',
            'email' => $email,
            'display_name' => 'User Mailbox',
            'access_token_encrypted' => 'user-access-token',
            'refresh_token_encrypted' => 'user-refresh-token',
            'token_expires_at' => now()->addHour(),
            'scopes' => [
                'https://www.googleapis.com/auth/gmail.send',
                'https://www.googleapis.com/auth/gmail.modify',
            ],
            'is_default' => true,
            'status' => 'active',
            'connected_at' => now(),
        ]);
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
}
