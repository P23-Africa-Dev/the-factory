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
use App\Services\Email\EmailMessageDTO;
use App\Services\Email\ParsedEmailDTO;
use App\Services\Email\Providers\GoogleProvider;
use App\Services\Email\Providers\ImapSmtpProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Mockery;
use Symfony\Component\Mime\Email;
use Tests\TestCase;

/**
 * "Send through Factory23": IMAP/SMTP accounts send CRM email via the platform
 * mailer while our host blocks outbound SMTP ports (DigitalOcean 25/465/587).
 */
class EmailPlatformSendTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'mail.mailers.array' => ['transport' => 'array'],
            'services.email_accounts.smtp_blocked_ports' => [25, 465, 587],
            'services.email_accounts.platform_send' => [
                'enabled' => true,
                'mailer' => 'array',
                'from_address' => 'crm@thefactory23.com',
                'brand' => 'Factory23',
            ],
        ]);
    }

    public function test_platform_send_goes_out_as_name_via_factory23_with_reply_to_the_user(): void
    {
        [$company, $user] = $this->seedCompanyWithUser();
        $account = $this->seedImapAccount($company, $user, sendViaPlatform: true);

        $provider = Mockery::mock(ImapSmtpProvider::class)->makePartial()->shouldAllowMockingProtectedMethods();
        $provider->shouldReceive('appendToSentFolder')
            ->once()
            ->withArgs(fn ($dto, string $raw): bool => str_contains($raw, 'Reply-To: Deen Dan <deen@ayoola.example>'));

        $result = $provider->send($account->toDTO(), new EmailMessageDTO(
            fromEmail: 'deen@ayoola.example',
            fromName: 'Deen Dan',
            to: [['email' => 'lead@example.com', 'name' => 'Lead']],
            cc: [],
            bcc: [],
            subject: 'Quote',
            bodyHtml: '<p>Hello</p>',
            bodyText: 'Hello',
        ));

        $messages = app('mail.manager')->mailer('array')->getSymfonyTransport()->messages();
        $this->assertCount(1, $messages);

        /** @var Email $sent */
        $sent = $messages[0]->getOriginalMessage();
        $this->assertSame('crm@thefactory23.com', $sent->getFrom()[0]->getAddress());
        $this->assertSame('Deen Dan via Factory23', $sent->getFrom()[0]->getName());
        $this->assertSame('deen@ayoola.example', $sent->getReplyTo()[0]->getAddress());
        $this->assertSame('lead@example.com', $sent->getTo()[0]->getAddress());

        $messageId = $sent->getHeaders()->get('Message-ID')->getBodyAsString();
        $rootId = trim($messageId, '<>');
        $this->assertStringEndsWith('@thefactory23.com', $rootId);
        $this->assertSame('platform-'.$rootId, $result['id']);
        $this->assertSame('imap-'.md5($rootId), $result['threadId']);
    }

    public function test_blocked_smtp_port_fails_fast_with_guidance_and_sends_nothing(): void
    {
        [$company, $user] = $this->seedCompanyWithUser();
        $account = $this->seedImapAccount($company, $user, sendViaPlatform: false);

        try {
            app(ImapSmtpProvider::class)->send($account->toDTO(), new EmailMessageDTO(
                fromEmail: 'deen@ayoola.example',
                fromName: null,
                to: [['email' => 'lead@example.com']],
                cc: [],
                bcc: [],
                subject: 'Quote',
                bodyHtml: null,
                bodyText: 'Hello',
            ));
            $this->fail('Expected a validation error.');
        } catch (ValidationException $exception) {
            $message = (string) collect($exception->errors())->flatten()->first();
            $this->assertStringContainsString('port 587', $message);
            $this->assertStringContainsString('Send through Factory23', $message);
        }

        $this->assertCount(0, app('mail.manager')->mailer('array')->getSymfonyTransport()->messages());
    }

    public function test_connection_check_reports_blocked_port_and_platform_sending(): void
    {
        [$company, $user] = $this->seedCompanyWithUser();
        $account = $this->seedImapAccount($company, $user, sendViaPlatform: false);
        $account->update(['imap_host' => null, 'imap_port' => null]);

        $blocked = app(ImapSmtpProvider::class)->diagnoseConnection($account->fresh()->toDTO());
        $this->assertFalse($blocked['ok']);
        $this->assertSame('port_blocked', $blocked['smtp']['code']);

        $account->update(['send_via_platform' => true]);
        $platform = app(ImapSmtpProvider::class)->diagnoseConnection($account->fresh()->toDTO());
        $this->assertTrue($platform['ok']);
        $this->assertSame('platform', $platform['smtp']['code']);
    }

    public function test_user_can_turn_platform_sending_on_through_the_api(): void
    {
        [$company, $user] = $this->seedCompanyWithUser();
        $account = $this->seedImapAccount($company, $user, sendViaPlatform: false);
        $account->update(['imap_host' => null, 'imap_port' => null]);

        $this->withToken($user->createToken('t', ['*'])->plainTextToken)
            ->getJson('/api/v1/admin/email-accounts?company_id='.$company->id)
            ->assertOk()
            ->assertJsonPath('data.items.0.send_via_platform', false)
            ->assertJsonPath('data.items.0.smtp_port_blocked', true)
            ->assertJsonPath('data.items.0.platform_sender', null);

        $this->withToken($user->createToken('t2', ['*'])->plainTextToken)
            ->patchJson('/api/v1/admin/email-accounts/'.$account->id, [
                'company_id' => $company->id,
                'send_via_platform' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.account.send_via_platform', true)
            ->assertJsonPath('data.account.platform_sender', 'crm@thefactory23.com')
            ->assertJsonPath('data.connection_test.ok', true);

        $this->assertTrue((bool) $account->fresh()->send_via_platform);
    }

    public function test_imap_reply_threads_on_the_references_root(): void
    {
        $parsed = app(ImapSmtpProvider::class)->parseMessage([
            'id' => '42',
            'headers' => "Subject: Re: Quote\r\nFrom: Lead <lead@example.com>\r\nMessage-ID: <reply-1@example.com>\r\n"
                ."In-Reply-To: <abc123@thefactory23.com>\r\nReferences: <abc123@thefactory23.com>\r\n",
            'body_text' => 'Thanks',
        ]);

        $this->assertSame('imap-'.md5('abc123@thefactory23.com'), $parsed->threadId);
    }

    public function test_reply_with_unknown_root_joins_the_leads_conversation_by_subject(): void
    {
        [$company, $user] = $this->seedCompanyWithUser();
        $lead = $this->seedLead($company, $user);
        $this->seedImapAccount($company, $user, sendViaPlatform: true);

        $thread = CrmEmailThread::query()->create([
            'company_id' => $company->id,
            'lead_id' => $lead->id,
            'gmail_thread_id' => 'imap-original',
            'subject' => 'Quote',
            'last_message_at' => now(),
            'unread_count' => 0,
            'message_count' => 1,
        ]);
        CrmEmailMessage::query()->create([
            'company_id' => $company->id,
            'thread_id' => $thread->id,
            'lead_id' => $lead->id,
            'gmail_message_id' => 'platform-abc',
            'gmail_thread_id' => 'imap-original',
            'direction' => CrmEmailDirection::Sent,
            'status' => CrmEmailStatus::Sent,
            'from_email' => 'deen@ayoola.example',
            'to_recipients' => [['email' => 'lead@example.com']],
            'subject' => 'Quote',
            'body_text' => 'Hello',
            'is_read' => true,
            'sent_by_user_id' => $user->id,
            'gmail_account_email' => 'deen@ayoola.example',
            'sent_at' => now(),
        ]);

        $imap = Mockery::mock(ImapSmtpProvider::class);
        $imap->shouldReceive('listMessages')->andReturn(['messages' => [['id' => '77']], 'nextPageToken' => null]);
        $imap->shouldReceive('getMessage')->andReturn(['id' => '77']);
        $imap->shouldReceive('parseMessage')->andReturn(new ParsedEmailDTO(
            messageId: '77',
            threadId: 'imap-'.md5('resend-replaced-id@amazonses.com'),
            subject: 'RE: Quote',
            fromEmail: 'lead@example.com',
            toRecipients: [['email' => 'deen@ayoola.example']],
            bodyText: 'Got it',
            sentAt: now()->toIso8601String(),
        ));
        $this->app->instance(ImapSmtpProvider::class, $imap);
        $this->app->instance(GoogleProvider::class, Mockery::mock(GoogleProvider::class));

        (new SyncLeadEmailsJob($company->id, $lead->id, $user->id))->handle(app(CrmEmailService::class));

        $reply = CrmEmailMessage::query()->where('gmail_message_id', '77')->firstOrFail();
        $this->assertSame($thread->id, (int) $reply->thread_id);
        $this->assertSame('imap-original', $reply->gmail_thread_id);
    }

    /**
     * @return array{0:Company,1:User}
     */
    private function seedCompanyWithUser(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-PLAT01',
            'name' => 'Platform Send Co',
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
            'role' => 'admin',
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

    private function seedImapAccount(Company $company, User $user, bool $sendViaPlatform): EmailAccount
    {
        return EmailAccount::query()->create([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'provider' => 'imap_smtp',
            'email' => 'deen@ayoola.example',
            'display_name' => 'Deen Dan',
            'smtp_host' => 'mail.ayoola.example',
            'smtp_port' => 587,
            'smtp_encryption' => 'tls',
            'smtp_username' => 'deen@ayoola.example',
            'smtp_password_encrypted' => 'secret',
            'send_via_platform' => $sendViaPlatform,
            'imap_host' => 'mail.ayoola.example',
            'imap_port' => 993,
            'imap_encryption' => 'ssl',
            'imap_password_encrypted' => 'secret',
            'is_default' => true,
            'status' => 'active',
            'connected_at' => now(),
        ]);
    }
}
