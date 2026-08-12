<?php

declare(strict_types=1);

namespace Tests\Unit\Email;

use App\Models\Company;
use App\Models\EmailAccount;
use App\Models\User;
use App\Services\Email\EmailMessageDTO;
use App\Services\Email\Providers\MicrosoftProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MicrosoftProviderTest extends TestCase
{
    use RefreshDatabase;

    public function test_get_thread_uses_conversation_filter_not_threads_endpoint(): void
    {
        $account = $this->seedMicrosoftAccount();

        Http::fake([
            'https://graph.microsoft.com/v1.0/me/messages*' => Http::response([
                'value' => [
                    ['id' => 'm1', 'conversationId' => 'conv-9', 'subject' => 'Hi'],
                ],
            ], 200),
        ]);

        $provider = app(MicrosoftProvider::class);
        $thread = $provider->getThread($account->toDTO(), 'conv-9');

        $this->assertSame('conv-9', $thread['id']);
        $this->assertCount(1, $thread['messages']);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/me/messages')
                && str_contains(urldecode($request->url()), "conversationId eq 'conv-9'")
                && ! str_contains($request->url(), '/me/threads/');
        });
    }

    public function test_send_returns_message_and_conversation_ids(): void
    {
        $account = $this->seedMicrosoftAccount();

        Http::fake([
            'https://graph.microsoft.com/v1.0/me/messages' => Http::response([
                'id' => 'graph-msg-1',
                'conversationId' => 'conv-1',
            ], 201),
            'https://graph.microsoft.com/v1.0/me/messages/graph-msg-1/send' => Http::response(null, 202),
        ]);

        $provider = app(MicrosoftProvider::class);

        $result = $provider->send(
            $account->toDTO(),
            new EmailMessageDTO(
                fromEmail: 'user@outlook.com',
                to: [['email' => 'lead@example.com']],
                subject: 'Hello',
                bodyHtml: '<p>Hi</p>',
                bodyText: 'Hi',
            ),
        );

        $this->assertSame('graph-msg-1', $result['id']);
        $this->assertSame('conv-1', $result['threadId']);
    }

    private function seedMicrosoftAccount(): EmailAccount
    {
        $company = Company::create([
            'company_id' => 'FAC-MS001',
            'name' => 'MS Factory',
            'country' => 'NG',
            'team_size' => '1-10',
            'use_case' => 'email',
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

        return EmailAccount::query()->create([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'provider' => 'microsoft',
            'email' => 'user@outlook.com',
            'access_token_encrypted' => 'ms-token',
            'refresh_token_encrypted' => 'ms-refresh',
            'token_expires_at' => now()->addHour(),
            'status' => 'active',
            'is_default' => true,
            'connected_at' => now(),
        ]);
    }
}
