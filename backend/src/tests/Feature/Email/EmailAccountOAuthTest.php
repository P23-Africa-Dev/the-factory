<?php

declare(strict_types=1);

namespace Tests\Feature\Email;

use App\Models\Company;
use App\Models\User;
use App\Services\Email\EmailAccountService;
use App\Services\Email\OAuth\GoogleMailOAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class EmailAccountOAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_request_google_authorize_url(): void
    {
        Config::set('services.google_mail.client_id', 'google-client-id');
        Config::set('services.google_mail.client_secret', 'google-client-secret');
        Config::set('services.google_mail.redirect_uri', 'https://api.test/api/v1/email-accounts/oauth/google/callback');

        [$company, $admin] = $this->seedCompanyWithAdmin();

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/admin/email-accounts/oauth/google/authorize?company_id=' . $company->id);

        $response->assertOk()
            ->assertJsonPath('success', true);

        $url = (string) $response->json('data.authorization_url');
        $this->assertStringContainsString('accounts.google.com', $url);
        $this->assertStringContainsString('client_id=google-client-id', $url);
        $this->assertStringContainsString('gmail.send', urldecode($url));
    }

    public function test_google_oauth_callback_creates_email_account(): void
    {
        Config::set('services.google_mail.client_id', 'google-client-id');
        Config::set('services.google_mail.client_secret', 'google-client-secret');
        Config::set('services.google_mail.redirect_uri', 'https://api.test/api/v1/email-accounts/oauth/google/callback');

        [$company, $admin] = $this->seedCompanyWithAdmin();

        $oauth = app(GoogleMailOAuthService::class);
        $auth = $oauth->buildAuthorizationUrl((int) $company->id, (int) $admin->id);
        $url = $auth['authorization_url'];
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
        $state = (string) ($query['state'] ?? '');

        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response([
                'access_token' => 'new-access',
                'refresh_token' => 'new-refresh',
                'expires_in' => 3600,
                'scope' => 'openid email https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify',
                'token_type' => 'Bearer',
            ], 200),
            'https://www.googleapis.com/oauth2/v3/userinfo' => Http::response([
                'email' => 'connected@gmail.com',
                'name' => 'Connected User',
                'sub' => 'google-sub-1',
            ], 200),
        ]);

        $response = $this->get('/api/v1/email-accounts/oauth/google/callback?' . http_build_query([
            'code' => 'auth-code',
            'state' => $state,
        ]));

        $response->assertOk();
        $this->assertDatabaseHas('email_accounts', [
            'company_id' => $company->id,
            'user_id' => $admin->id,
            'provider' => 'google',
            'email' => 'connected@gmail.com',
            'status' => 'active',
        ]);
    }

    public function test_connect_from_oauth_reconnects_existing_account(): void
    {
        [$company, $admin] = $this->seedCompanyWithAdmin();
        $service = app(EmailAccountService::class);

        $service->connect($admin, [
            'company_id' => $company->id,
            'provider' => 'google',
            'email' => 'reconnect@gmail.com',
            'access_token' => 'old-access',
            'refresh_token' => 'old-refresh',
            'is_default' => true,
        ]);

        $service->disconnect($admin, \App\Models\EmailAccount::query()->firstOrFail(), $company->id);

        $account = $service->connectFromOAuth($admin, [
            'company_id' => $company->id,
            'provider' => 'google',
            'email' => 'reconnect@gmail.com',
            'display_name' => 'Reconnected',
            'access_token' => 'fresh-access',
            'refresh_token' => 'fresh-refresh',
            'token_expires_at' => now()->addHour()->toIso8601String(),
            'scopes' => ['https://www.googleapis.com/auth/gmail.send'],
        ]);

        $this->assertSame('active', $account->status);
        $this->assertSame('Reconnected', $account->display_name);
        $this->assertNull($account->disconnected_at);
        $this->assertSame(1, \App\Models\EmailAccount::query()->count());
    }

    /**
     * @return array{0:Company,1:User}
     */
    private function seedCompanyWithAdmin(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-OAUTH001',
            'name' => 'OAuth Factory',
            'country' => 'NG',
            'team_size' => '1-10',
            'use_case' => 'email oauth',
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

        return [$company, $admin];
    }
}
