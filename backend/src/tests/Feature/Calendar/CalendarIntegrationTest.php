<?php

declare(strict_types=1);

namespace Tests\Feature\Calendar;

use App\Models\Company;
use App\Models\CompanyCalendarConnection;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CalendarIntegrationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('services.google_calendar.client_id', 'google-client-id');
        config()->set('services.google_calendar.client_secret', 'google-client-secret');
        config()->set('services.google_calendar.redirect_uri', 'http://localhost:8080/api/v1/calendar/integration/callback');
        config()->set('services.google_calendar.scopes', [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events',
        ]);
    }

    public function test_owner_can_request_google_calendar_connect_url(): void
    {
        [$company, $owner] = $this->seedCompanyUsers();

        $response = $this->withToken($owner->createToken('owner-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/calendar/integration/connect-url', [
                'company_id' => strtolower($company->company_id),
            ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.expires_in_seconds', 300)
            ->assertJsonStructure([
                'data' => ['authorization_url', 'expires_in_seconds'],
            ]);

        $this->assertStringContainsString(
            'https://accounts.google.com/o/oauth2/v2/auth?',
            (string) $response->json('data.authorization_url'),
        );
    }

    public function test_admin_can_request_google_calendar_connect_url(): void
    {
        [$company,, $admin] = $this->seedCompanyUsers();

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/calendar/integration/connect-url', [
                'company_id' => $company->id,
            ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.expires_in_seconds', 300)
            ->assertJsonStructure([
                'data' => ['authorization_url', 'expires_in_seconds'],
            ]);

        $this->assertStringContainsString(
            'https://accounts.google.com/o/oauth2/v2/auth?',
            (string) $response->json('data.authorization_url'),
        );
    }

    public function test_agent_cannot_request_google_calendar_connect_url(): void
    {
        [$company,,, $agent] = $this->seedCompanyUsers();

        $response = $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/calendar/integration/connect-url', [
                'company_id' => $company->company_id,
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath('success', false)
            ->assertJsonPath(
                'errors.authorization.0',
                'Only company owners or admins can connect or disconnect Google Calendar integration.',
            );
    }

    public function test_agent_can_view_calendar_integration_status(): void
    {
        [$company, $owner,, $agent] = $this->seedCompanyUsers();

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
            ->getJson('/api/v1/calendar/integration/status?company_id=' . $company->company_id);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.connected', true)
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.organizer_email', 'owner@factory23.test')
            ->assertJsonPath('data.owner_user_id', $owner->id);
    }

    public function test_admin_can_disconnect_calendar_integration(): void
    {
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
            ->deleteJson('/api/v1/calendar/integration/disconnect', [
                'company_id' => $company->company_id,
            ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.disconnected', true);

        $this->assertDatabaseHas('company_calendar_connections', [
            'company_id' => $company->id,
            'status' => 'revoked',
        ]);
    }

    public function test_oauth_callback_persists_connection_for_owner(): void
    {
        [$company, $owner] = $this->seedCompanyUsers();

        $connectUrlResponse = $this->withToken($owner->createToken('owner-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/calendar/integration/connect-url', [
                'company_id' => $company->company_id,
            ]);

        $state = $this->extractStateFromAuthorizationUrl((string) $connectUrlResponse->json('data.authorization_url'));

        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response([
                'access_token' => 'oauth-access-token',
                'refresh_token' => 'oauth-refresh-token',
                'expires_in' => 3600,
                'scope' => 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',
                'token_type' => 'Bearer',
            ], 200),
            'https://www.googleapis.com/oauth2/v3/userinfo' => Http::response([
                'sub' => 'google-sub-123',
                'email' => 'owner@factory23.test',
            ], 200),
        ]);

        $callbackResponse = $this->getJson('/api/v1/calendar/integration/callback?code=oauth-code&state=' . urlencode($state));

        $callbackResponse->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.connected', true)
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.organizer_email', 'owner@factory23.test')
            ->assertJsonPath('data.owner_user_id', $owner->id);

        $this->assertDatabaseHas('company_calendar_connections', [
            'company_id' => $company->id,
            'owner_user_id' => $owner->id,
            'organizer_email' => 'owner@factory23.test',
            'organizer_google_user_id' => 'google-sub-123',
            'status' => 'active',
        ]);
    }

    public function test_oauth_callback_returns_popup_html_for_browser_requests(): void
    {
        [$company, $owner] = $this->seedCompanyUsers();

        $connectUrlResponse = $this->withToken($owner->createToken('owner-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/calendar/integration/connect-url', [
                'company_id' => $company->company_id,
            ]);

        $state = $this->extractStateFromAuthorizationUrl((string) $connectUrlResponse->json('data.authorization_url'));

        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response([
                'access_token' => 'oauth-access-token',
                'refresh_token' => 'oauth-refresh-token',
                'expires_in' => 3600,
                'scope' => 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',
                'token_type' => 'Bearer',
            ], 200),
            'https://www.googleapis.com/oauth2/v3/userinfo' => Http::response([
                'sub' => 'google-sub-123',
                'email' => 'owner@factory23.test',
            ], 200),
        ]);

        $callbackResponse = $this->get('/api/v1/calendar/integration/callback?code=oauth-code&state=' . urlencode($state));

        $callbackResponse->assertOk();
        $callbackResponse->assertHeader('Content-Type', 'text/html; charset=UTF-8');
        $callbackResponse->assertSee('google-calendar-oauth', false);
        $callbackResponse->assertSee('Google Calendar connected successfully. You can close this window.', false);
    }

    public function test_oauth_callback_persists_connection_for_admin(): void
    {
        [$company,, $admin] = $this->seedCompanyUsers();

        $connectUrlResponse = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/calendar/integration/connect-url', [
                'company_id' => $company->company_id,
            ]);

        $state = $this->extractStateFromAuthorizationUrl((string) $connectUrlResponse->json('data.authorization_url'));

        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response([
                'access_token' => 'oauth-access-token',
                'refresh_token' => 'oauth-refresh-token',
                'expires_in' => 3600,
                'scope' => 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',
                'token_type' => 'Bearer',
            ], 200),
            'https://www.googleapis.com/oauth2/v3/userinfo' => Http::response([
                'sub' => 'google-sub-456',
                'email' => 'admin@factory23.test',
            ], 200),
        ]);

        $callbackResponse = $this->getJson('/api/v1/calendar/integration/callback?code=oauth-code&state=' . urlencode($state));

        $callbackResponse->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.connected', true)
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.organizer_email', 'admin@factory23.test')
            ->assertJsonPath('data.owner_user_id', $admin->id);

        $this->assertDatabaseHas('company_calendar_connections', [
            'company_id' => $company->id,
            'owner_user_id' => $admin->id,
            'organizer_email' => 'admin@factory23.test',
            'organizer_google_user_id' => 'google-sub-456',
            'status' => 'active',
        ]);
    }

    public function test_oauth_callback_rejects_replayed_state(): void
    {
        [$company, $owner] = $this->seedCompanyUsers();

        $connectUrlResponse = $this->withToken($owner->createToken('owner-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/calendar/integration/connect-url', [
                'company_id' => $company->company_id,
            ]);

        $state = $this->extractStateFromAuthorizationUrl((string) $connectUrlResponse->json('data.authorization_url'));

        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response([
                'access_token' => 'oauth-access-token',
                'refresh_token' => 'oauth-refresh-token',
                'expires_in' => 3600,
            ], 200),
            'https://www.googleapis.com/oauth2/v3/userinfo' => Http::response([
                'sub' => 'google-sub-123',
                'email' => 'owner@factory23.test',
            ], 200),
        ]);

        $this->getJson('/api/v1/calendar/integration/callback?code=oauth-code&state=' . urlencode($state))
            ->assertOk();

        $this->getJson('/api/v1/calendar/integration/callback?code=oauth-code-two&state=' . urlencode($state))
            ->assertUnprocessable()
            ->assertJsonPath('success', false)
            ->assertJsonPath('errors.integration.0', 'OAuth state is invalid or has already been used.');
    }

    public function test_oauth_callback_rejects_when_user_is_no_longer_calendar_admin(): void
    {
        [$company, $owner] = $this->seedCompanyUsers();

        $connectUrlResponse = $this->withToken($owner->createToken('owner-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/calendar/integration/connect-url', [
                'company_id' => $company->company_id,
            ]);

        $state = $this->extractStateFromAuthorizationUrl((string) $connectUrlResponse->json('data.authorization_url'));

        DB::table('company_users')
            ->where('company_id', $company->id)
            ->where('user_id', $owner->id)
            ->update([
                'role' => 'agent',
                'updated_at' => now(),
            ]);

        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response([
                'access_token' => 'oauth-access-token',
                'refresh_token' => 'oauth-refresh-token',
                'expires_in' => 3600,
            ], 200),
            'https://www.googleapis.com/oauth2/v3/userinfo' => Http::response([
                'sub' => 'google-sub-123',
                'email' => 'owner@factory23.test',
            ], 200),
        ]);

        $this->getJson('/api/v1/calendar/integration/callback?code=oauth-code&state=' . urlencode($state))
            ->assertUnprocessable()
            ->assertJsonPath('success', false)
            ->assertJsonPath('errors.integration.0', 'Only the current company owner or admin can complete Google Calendar connection.');
    }

    public function test_company_has_only_one_calendar_connection_record(): void
    {
        [$company, $owner] = $this->seedCompanyUsers();

        CompanyCalendarConnection::create([
            'company_id' => $company->id,
            'owner_user_id' => $owner->id,
            'organizer_email' => 'owner@factory23.test',
            'organizer_google_user_id' => 'google-owner-123',
            'access_token_encrypted' => 'access-token',
            'refresh_token_encrypted' => 'refresh-token',
            'token_expires_at' => now()->addHour(),
            'status' => 'active',
            'connected_at' => now(),
        ]);

        $this->expectException(QueryException::class);

        CompanyCalendarConnection::create([
            'company_id' => $company->id,
            'owner_user_id' => $owner->id,
            'organizer_email' => 'owner-two@factory23.test',
            'organizer_google_user_id' => 'google-owner-456',
            'access_token_encrypted' => 'access-token-two',
            'refresh_token_encrypted' => 'refresh-token-two',
            'token_expires_at' => now()->addHour(),
            'status' => 'active',
            'connected_at' => now(),
        ]);
    }

    private function seedCompanyUsers(string $companyId = 'FAC-CAL001'): array
    {
        $company = Company::create([
            'company_id' => $companyId,
            'name' => 'Calendar Company',
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

    private function extractStateFromAuthorizationUrl(string $authorizationUrl): string
    {
        $query = parse_url($authorizationUrl, PHP_URL_QUERY);
        parse_str((string) $query, $params);

        return (string) ($params['state'] ?? '');
    }
}
