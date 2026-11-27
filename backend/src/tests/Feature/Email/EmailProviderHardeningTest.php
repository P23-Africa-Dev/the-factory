<?php

declare(strict_types=1);

namespace Tests\Feature\Email;

use App\Enums\CrmEmailDirection;
use App\Enums\CrmEmailStatus;
use App\Jobs\SyncLeadEmailsJob;
use App\Models\Company;
use App\Models\CrmEmailMessage;
use App\Models\CrmEmailThread;
use App\Models\EmailAccount;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\User;
use App\Services\Crm\CrmEmailService;
use App\Services\Email\ParsedEmailDTO;
use App\Services\Email\Providers\GoogleProvider;
use App\Services\Email\Providers\ImapSmtpProvider;
use App\Services\Email\Providers\ZohoProvider;
use App\Services\Google\EmailAccountGmailConnection;
use App\Services\Google\GoogleTokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class EmailProviderHardeningTest extends TestCase
{
    use RefreshDatabase;

    public function test_zoho_requests_use_the_zoho_oauthtoken_authorization_scheme(): void
    {
        [$company, $user] = $this->seedCompanyWithUser();
        $account = $this->seedAccount($company, $user, 'zoho', 'z@example.com');
        $account->update(['provider_metadata' => ['zoho_account_id' => '12345']]);

        Http::fake([
            'mail.zoho.com/*' => Http::response(['data' => ['accountId' => '12345']], 200),
        ]);

        app(ZohoProvider::class)->getProfile($account->fresh()->toDTO());

        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), 'mail.zoho.com/api/accounts/12345')
            && $request->header('Authorization')[0] === 'Zoho-oauthtoken test-access-token');
    }

    public function test_transient_google_refresh_failure_does_not_park_the_account_in_error(): void
    {
        [$company, $user] = $this->seedCompanyWithUser();
        $account = $this->seedAccount($company, $user, 'google', 'g@example.com');

        Http::fake(['oauth2.googleapis.com/token' => Http::response(['error' => 'backend_error'], 503)]);

        try {
            app(GoogleTokenService::class)->refreshAccessToken(new EmailAccountGmailConnection($account));
            $this->fail('Expected the refresh to throw.');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString('temporarily failed', $exception->getMessage());
        }

        $this->assertSame('active', $account->fresh()->status);
    }

    public function test_revoked_google_grant_marks_the_account_for_reconnection(): void
    {
        [$company, $user] = $this->seedCompanyWithUser();
        $account = $this->seedAccount($company, $user, 'google', 'g@example.com');

        Http::fake(['oauth2.googleapis.com/token' => Http::response([
            'error' => 'invalid_grant',
            'error_description' => 'Token has been expired or revoked.',
        ], 400)]);

        $this->expectException(ValidationException::class);

        try {
            app(GoogleTokenService::class)->refreshAccessToken(new EmailAccountGmailConnection($account));
        } finally {
            $fresh = $account->fresh();
            $this->assertSame('error', $fresh->status);
            $this->assertStringContainsString('invalid_grant', (string) $fresh->last_error_message);
        }
    }

    public function test_already_sent_message_is_not_sent_again_on_job_retry(): void
    {
        [$company, $user] = $this->seedCompanyWithUser();
        $this->seedAccount($company, $user, 'google', 'g@example.com');
        $lead = $this->seedLead($company, $user);

        $thread = CrmEmailThread::query()->create([
            'company_id' => $company->id,
            'lead_id' => $lead->id,
            'gmail_thread_id' => 'thread-1',
            'subject' => 'Hello',
            'last_message_at' => now(),
            'unread_count' => 0,
            'message_count' => 1,
        ]);

        $message = CrmEmailMessage::query()->create([
            'company_id' => $company->id,
            'thread_id' => $thread->id,
            'lead_id' => $lead->id,
            'gmail_message_id' => 'provider-msg-1',
            'gmail_thread_id' => 'thread-1',
            'direction' => CrmEmailDirection::Sent,
            'status' => CrmEmailStatus::Sent,
            'from_email' => 'g@example.com',
            'to_recipients' => [['email' => 'lead@example.com']],
            'subject' => 'Hello',
            'body_html' => '<p>Hi</p>',
            'body_text' => 'Hi',
            'is_read' => true,
            'sent_by_user_id' => $user->id,
            'gmail_account_email' => 'g@example.com',
            'sent_at' => now(),
        ]);

        Http::fake();

        app(CrmEmailService::class)->sendMessageById($message->id);

        Http::assertNothingSent();
        $this->assertSame(CrmEmailStatus::Sent, $message->fresh()->status);
    }

    public function test_lead_email_polling_syncs_after_the_response_for_connected_users_with_a_short_throttle(): void
    {
        Bus::fake();

        [$company, $user] = $this->seedCompanyWithUser();
        $lead = $this->seedLead($company, $user);
        $service = app(CrmEmailService::class);

        // No mailbox connected: nothing to sync.
        $service->listThreadsForLead($user, $lead, ['company_id' => $company->id, 'sync' => true]);
        Bus::assertNotDispatched(SyncLeadEmailsJob::class);

        $this->seedAccount($company, $user, 'google', 'g@example.com');

        // Runs right after the response, not on the shared email-sync queue.
        $service->listThreadsForLead($user, $lead, ['company_id' => $company->id, 'sync' => true]);
        $service->listThreadsForLead($user, $lead, ['company_id' => $company->id, 'sync' => true]);
        Bus::assertDispatchedAfterResponseTimes(SyncLeadEmailsJob::class, 1);

        $this->travel(CrmEmailService::LIVE_LEAD_SYNC_SECONDS + 1)->seconds();
        $service->listThreadsForLead($user, $lead, ['company_id' => $company->id, 'sync' => true]);
        Bus::assertDispatchedAfterResponseTimes(SyncLeadEmailsJob::class, 2);
    }

    public function test_live_lead_sync_imports_a_reply_from_a_non_default_mailbox_used_in_the_conversation(): void
    {
        [$company, $user] = $this->seedCompanyWithUser();
        $lead = $this->seedLead($company, $user);
        $this->seedAccount($company, $user, 'google', 'g@example.com');
        $imap = EmailAccount::query()->create([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'provider' => 'imap_smtp',
            'email' => 'sales@example.com',
            'smtp_host' => 'mail.example.com',
            'smtp_port' => 2525,
            'imap_host' => 'mail.example.com',
            'imap_port' => 993,
            'is_default' => false,
            'status' => 'active',
            'connected_at' => now(),
        ]);

        // The user emailed this lead from the (non-default) IMAP mailbox.
        $thread = CrmEmailThread::query()->create([
            'company_id' => $company->id,
            'lead_id' => $lead->id,
            'gmail_thread_id' => 'imap-thread-1',
            'subject' => 'Quote',
            'last_message_at' => now(),
            'unread_count' => 0,
            'message_count' => 1,
        ]);
        CrmEmailMessage::query()->create([
            'company_id' => $company->id,
            'thread_id' => $thread->id,
            'lead_id' => $lead->id,
            'gmail_message_id' => 'imap-sent-1',
            'gmail_thread_id' => 'imap-thread-1',
            'direction' => CrmEmailDirection::Sent,
            'status' => CrmEmailStatus::Sent,
            'from_email' => 'sales@example.com',
            'to_recipients' => [['email' => 'lead@example.com']],
            'subject' => 'Quote',
            'body_text' => 'Hi',
            'is_read' => true,
            'sent_by_user_id' => $user->id,
            'gmail_account_email' => 'sales@example.com',
            'sent_at' => now(),
        ]);

        $google = \Mockery::mock(GoogleProvider::class);
        $google->shouldReceive('listMessages')->once()->andReturn(['messages' => [], 'nextPageToken' => 'page-2']);
        $this->app->instance(GoogleProvider::class, $google);

        $imapProvider = \Mockery::mock(ImapSmtpProvider::class);
        $imapProvider->shouldReceive('listMessages')->once()->andReturn([
            'messages' => [['id' => 'imap-sent-1'], ['id' => 'imap-reply-1']],
            'nextPageToken' => 'page-2',
        ]);
        $imapProvider->shouldReceive('getMessage')->once()->with(\Mockery::any(), 'imap-reply-1')->andReturn(['id' => 'imap-reply-1']);
        $imapProvider->shouldReceive('parseMessage')->once()->andReturn(new ParsedEmailDTO(
            messageId: 'imap-reply-1',
            threadId: 'imap-thread-1',
            subject: 'Re: Quote',
            fromEmail: 'lead@example.com',
            toRecipients: [['email' => 'sales@example.com']],
            bodyText: 'Got it, thanks',
            sentAt: now()->toIso8601String(),
        ));
        $this->app->instance(ImapSmtpProvider::class, $imapProvider);

        (new SyncLeadEmailsJob($company->id, $lead->id, $user->id))->handle(app(CrmEmailService::class));

        $reply = CrmEmailMessage::query()->where('gmail_message_id', 'imap-reply-1')->first();
        $this->assertNotNull($reply);
        $this->assertSame($lead->id, (int) $reply->lead_id);
        $this->assertSame(CrmEmailDirection::Received, $reply->direction);
        $this->assertSame($imap->id, EmailAccount::query()->whereRaw('LOWER(email) = ?', ['sales@example.com'])->value('id'));
    }

    public function test_imap_connection_errors_are_humanized(): void
    {
        $method = new \ReflectionMethod(ImapSmtpProvider::class, 'humanizeMailServerError');

        $message = $method->invoke(app(ImapSmtpProvider::class), 'Can not authenticate to IMAP server: [AUTHENTICATIONFAILED] Invalid credentials', 'IMAP');

        $this->assertStringStartsWith('IMAP: Email login failed.', $message);
    }

    /**
     * @return array{0:Company,1:User}
     */
    private function seedCompanyWithUser(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-HARD01',
            'name' => 'Email Hardening Co',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'CRM',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $user = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'role' => 'owner',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [$company, $user];
    }

    private function seedLead(Company $company, User $creator): Lead
    {
        $pipeline = LeadPipeline::query()->create([
            'company_id' => $company->id,
            'name' => 'Default Pipeline',
            'currency_code' => 'USD',
            'sort_order' => 0,
            'is_default' => true,
        ]);

        return Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipeline->id,
            'created_by_user_id' => $creator->id,
            'name' => 'Lead One',
            'email' => 'lead@example.com',
            'status' => 'new',
            'priority' => 'medium',
        ]);
    }

    private function seedAccount(Company $company, User $user, string $provider, string $email): EmailAccount
    {
        return EmailAccount::query()->create([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'provider' => $provider,
            'email' => $email,
            'access_token_encrypted' => 'test-access-token',
            'refresh_token_encrypted' => 'test-refresh-token',
            'token_expires_at' => now()->addHour(),
            'is_default' => true,
            'status' => 'active',
            'connected_at' => now(),
        ]);
    }
}
