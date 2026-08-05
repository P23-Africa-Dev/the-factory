<?php

declare(strict_types=1);

namespace Tests\Feature\Email;

use App\Models\Company;
use App\Models\EmailAccount;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class EmailAccountApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_their_email_accounts(): void
    {
        [$company, $admin] = $this->seedCompanyWithAdmin();

        EmailAccount::query()->create([
            'company_id' => $company->id,
            'user_id' => $admin->id,
            'provider' => 'google',
            'email' => 'admin@gmail.com',
            'display_name' => 'Admin Gmail',
            'access_token_encrypted' => 'encrypted-token',
            'refresh_token_encrypted' => 'encrypted-refresh',
            'token_expires_at' => now()->addHour(),
            'scopes' => ['https://www.googleapis.com/auth/gmail.send'],
            'is_default' => true,
            'status' => 'active',
            'connected_at' => now(),
        ]);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/admin/email-accounts?company_id=' . $company->id);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.provider', 'google')
            ->assertJsonPath('data.items.0.email', 'admin@gmail.com')
            ->assertJsonPath('data.items.0.is_default', true)
            ->assertJsonPath('data.items.0.status', 'active');
    }

    public function test_admin_can_connect_google_email_account(): void
    {
        [$company, $admin] = $this->seedCompanyWithAdmin();

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/admin/email-accounts', [
                'company_id' => $company->id,
                'provider' => 'google',
                'email' => 'admin@gmail.com',
                'display_name' => 'Work Gmail',
                'access_token' => 'google-access-token',
                'refresh_token' => 'google-refresh-token',
                'token_expires_at' => now()->addHour()->toIso8601String(),
                'scopes' => ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.modify'],
                'is_default' => true,
            ]);

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.account.provider', 'google')
            ->assertJsonPath('data.account.email', 'admin@gmail.com')
            ->assertJsonPath('data.account.is_default', true)
            ->assertJsonPath('data.account.status', 'active');

        $this->assertDatabaseHas('email_accounts', [
            'company_id' => $company->id,
            'user_id' => $admin->id,
            'provider' => 'google',
            'email' => 'admin@gmail.com',
            'status' => 'active',
            'is_default' => true,
        ]);
    }

    public function test_admin_can_connect_microsoft_email_account(): void
    {
        [$company, $admin] = $this->seedCompanyWithAdmin();

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/admin/email-accounts', [
                'company_id' => $company->id,
                'provider' => 'microsoft',
                'email' => 'admin@outlook.com',
                'display_name' => 'Outlook Work',
                'access_token' => 'ms-access-token',
                'refresh_token' => 'ms-refresh-token',
                'token_expires_at' => now()->addHour()->toIso8601String(),
                'scopes' => ['Mail.Send', 'Mail.Read'],
            ]);

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.account.provider', 'microsoft')
            ->assertJsonPath('data.account.email', 'admin@outlook.com');

        $this->assertDatabaseHas('email_accounts', [
            'provider' => 'microsoft',
            'email' => 'admin@outlook.com',
            'status' => 'active',
        ]);
    }

    public function test_admin_can_connect_imap_smtp_email_account(): void
    {
        [$company, $admin] = $this->seedCompanyWithAdmin();

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/admin/email-accounts', [
                'company_id' => $company->id,
                'provider' => 'imap_smtp',
                'email' => 'admin@custom-domain.com',
                'display_name' => 'Custom Mail',
                'smtp_host' => 'smtp.custom-domain.com',
                'smtp_port' => 587,
                'smtp_encryption' => 'tls',
                'smtp_username' => 'admin@custom-domain.com',
                'smtp_password' => 'smtp-pass',
                'imap_host' => 'imap.custom-domain.com',
                'imap_port' => 993,
                'imap_encryption' => 'ssl',
                'imap_username' => 'admin@custom-domain.com',
                'imap_password' => 'imap-pass',
            ]);

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.account.provider', 'imap_smtp')
            ->assertJsonPath('data.account.email', 'admin@custom-domain.com')
            ->assertJsonPath('data.account.smtp_host', 'smtp.custom-domain.com')
            ->assertJsonPath('data.account.smtp_port', 587)
            ->assertJsonPath('data.account.imap_host', 'imap.custom-domain.com')
            ->assertJsonPath('data.account.imap_port', 993);

        $this->assertDatabaseHas('email_accounts', [
            'provider' => 'imap_smtp',
            'email' => 'admin@custom-domain.com',
            'smtp_host' => 'smtp.custom-domain.com',
            'imap_host' => 'imap.custom-domain.com',
        ]);
    }

    public function test_cannot_connect_duplicate_email_account(): void
    {
        [$company, $admin] = $this->seedCompanyWithAdmin();

        EmailAccount::query()->create([
            'company_id' => $company->id,
            'user_id' => $admin->id,
            'provider' => 'google',
            'email' => 'admin@gmail.com',
            'access_token_encrypted' => 'existing-token',
            'status' => 'active',
            'connected_at' => now(),
        ]);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/admin/email-accounts', [
                'company_id' => $company->id,
                'provider' => 'google',
                'email' => 'admin@gmail.com',
                'access_token' => 'new-token',
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath('success', false);
    }

    public function test_connect_rejects_unsupported_provider(): void
    {
        [$company, $admin] = $this->seedCompanyWithAdmin();

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/admin/email-accounts', [
                'company_id' => $company->id,
                'provider' => 'yahoo',
                'email' => 'admin@yahoo.com',
                'access_token' => 'token',
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath('success', false);
    }

    public function test_admin_can_disconnect_email_account(): void
    {
        [$company, $admin] = $this->seedCompanyWithAdmin();

        $account = EmailAccount::query()->create([
            'company_id' => $company->id,
            'user_id' => $admin->id,
            'provider' => 'google',
            'email' => 'admin@gmail.com',
            'access_token_encrypted' => 'encrypted-token',
            'refresh_token_encrypted' => 'encrypted-refresh',
            'status' => 'active',
            'connected_at' => now(),
        ]);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->deleteJson('/api/v1/admin/email-accounts/' . $account->id, [
                'company_id' => $company->id,
            ]);

        $response->assertOk()
            ->assertJsonPath('success', true);

        $this->assertDatabaseHas('email_accounts', [
            'id' => $account->id,
            'status' => 'disconnected',
        ]);
    }

    public function test_admin_can_set_default_email_account(): void
    {
        [$company, $admin] = $this->seedCompanyWithAdmin();

        $account1 = EmailAccount::query()->create([
            'company_id' => $company->id,
            'user_id' => $admin->id,
            'provider' => 'google',
            'email' => 'primary@gmail.com',
            'access_token_encrypted' => 'token-1',
            'is_default' => true,
            'status' => 'active',
            'connected_at' => now(),
        ]);

        $account2 = EmailAccount::query()->create([
            'company_id' => $company->id,
            'user_id' => $admin->id,
            'provider' => 'microsoft',
            'email' => 'secondary@outlook.com',
            'access_token_encrypted' => 'token-2',
            'is_default' => false,
            'status' => 'active',
            'connected_at' => now(),
        ]);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->patchJson('/api/v1/admin/email-accounts/' . $account2->id, [
                'company_id' => $company->id,
                'is_default' => true,
            ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.account.is_default', true);

        $this->assertDatabaseHas('email_accounts', [
            'id' => $account1->id,
            'is_default' => false,
        ]);
        $this->assertDatabaseHas('email_accounts', [
            'id' => $account2->id,
            'is_default' => true,
        ]);
    }

    public function test_admin_can_rename_email_account(): void
    {
        [$company, $admin] = $this->seedCompanyWithAdmin();

        $account = EmailAccount::query()->create([
            'company_id' => $company->id,
            'user_id' => $admin->id,
            'provider' => 'google',
            'email' => 'admin@gmail.com',
            'display_name' => 'Old Name',
            'access_token_encrypted' => 'token',
            'status' => 'active',
            'connected_at' => now(),
        ]);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->patchJson('/api/v1/admin/email-accounts/' . $account->id, [
                'company_id' => $company->id,
                'display_name' => 'New Display Name',
            ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.account.display_name', 'New Display Name');

        $this->assertDatabaseHas('email_accounts', [
            'id' => $account->id,
            'display_name' => 'New Display Name',
        ]);
    }

    public function test_admin_can_refresh_oauth_tokens(): void
    {
        [$company, $admin] = $this->seedCompanyWithAdmin();

        $account = EmailAccount::query()->create([
            'company_id' => $company->id,
            'user_id' => $admin->id,
            'provider' => 'google',
            'email' => 'admin@gmail.com',
            'access_token_encrypted' => 'old-access-token',
            'refresh_token_encrypted' => 'old-refresh-token',
            'status' => 'active',
            'connected_at' => now(),
        ]);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/admin/email-accounts/' . $account->id . '/refresh', [
                'company_id' => $company->id,
                'access_token' => 'new-access-token',
                'refresh_token' => 'new-refresh-token',
                'token_expires_at' => now()->addHour()->toIso8601String(),
            ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.account.status', 'active');

        $this->assertDatabaseHas('email_accounts', [
            'id' => $account->id,
            'status' => 'active',
        ]);
    }

    public function test_agent_cannot_access_another_users_email_account(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyWithAdminAndAgent();

        $account = EmailAccount::query()->create([
            'company_id' => $company->id,
            'user_id' => $admin->id,
            'provider' => 'google',
            'email' => 'admin@gmail.com',
            'access_token_encrypted' => 'token',
            'status' => 'active',
            'connected_at' => now(),
        ]);

        $response = $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->deleteJson('/api/v1/agent/email-accounts/' . $account->id, [
                'company_id' => $company->id,
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath('success', false);
    }

    public function test_first_account_auto_becomes_default(): void
    {
        [$company, $admin] = $this->seedCompanyWithAdmin();

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/admin/email-accounts', [
                'company_id' => $company->id,
                'provider' => 'google',
                'email' => 'first@gmail.com',
                'access_token' => 'token',
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.account.is_default', true);
    }

    public function test_connect_rejects_invalid_email(): void
    {
        [$company, $admin] = $this->seedCompanyWithAdmin();

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/admin/email-accounts', [
                'company_id' => $company->id,
                'provider' => 'google',
                'email' => 'not-an-email',
                'access_token' => 'token',
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath('success', false);
    }

    public function test_imap_smtp_requires_host_and_port(): void
    {
        [$company, $admin] = $this->seedCompanyWithAdmin();

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/admin/email-accounts', [
                'company_id' => $company->id,
                'provider' => 'imap_smtp',
                'email' => 'admin@custom.com',
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath('success', false);
    }

    private function seedCompanyWithAdmin(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-EMAIL002',
            'name' => 'Email Test Factory',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'CRM email testing',
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

    private function seedCompanyWithAdminAndAgent(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-AC003',
            'name' => 'Multi-User Email Factory',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'CRM email testing',
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

        return [$company, $admin, $agent];
    }
}
