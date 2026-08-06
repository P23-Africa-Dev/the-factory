<?php

declare(strict_types=1);

namespace Tests\Unit\Email;

use App\Models\Company;
use App\Models\EmailAccount;
use App\Models\User;
use App\Services\Company\CompanyContextService;
use App\Services\Email\EmailAccountService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Mockery;
use Tests\TestCase;

class EmailAccountServiceTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private User $user;
    private EmailAccountService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create([
            'company_id' => 'FAC-UNIT001',
            'name' => 'Unit Test Factory',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Unit testing',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $this->user = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            'company_id' => $this->company->id,
            'user_id' => $this->user->id,
            'role' => 'admin',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->service = app(EmailAccountService::class);
    }

    public function test_list_for_user_returns_empty_when_no_accounts(): void
    {
        $accounts = $this->service->listForUser($this->user, $this->company->id);

        $this->assertCount(0, $accounts);
    }

    public function test_list_for_user_returns_accounts_ordered_by_default(): void
    {
        EmailAccount::query()->create([
            'company_id' => $this->company->id,
            'user_id' => $this->user->id,
            'provider' => 'microsoft',
            'email' => 'secondary@outlook.com',
            'access_token_encrypted' => 'token-2',
            'is_default' => false,
            'status' => 'active',
            'connected_at' => now(),
        ]);

        EmailAccount::query()->create([
            'company_id' => $this->company->id,
            'user_id' => $this->user->id,
            'provider' => 'google',
            'email' => 'primary@gmail.com',
            'access_token_encrypted' => 'token-1',
            'is_default' => true,
            'status' => 'active',
            'connected_at' => now(),
        ]);

        $accounts = $this->service->listForUser($this->user, $this->company->id);

        $this->assertCount(2, $accounts);
        $this->assertTrue($accounts->first()->is_default);
        $this->assertEquals('primary@gmail.com', $accounts->first()->email);
    }

    public function test_connect_creates_google_account(): void
    {
        $account = $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'google',
            'email' => 'test@gmail.com',
            'display_name' => 'Test Gmail',
            'access_token' => 'access-token-123',
            'refresh_token' => 'refresh-token-456',
            'token_expires_at' => now()->addHour()->toIso8601String(),
            'scopes' => ['https://www.googleapis.com/auth/gmail.send'],
        ]);

        $this->assertInstanceOf(EmailAccount::class, $account);
        $this->assertEquals('google', $account->provider);
        $this->assertEquals('test@gmail.com', $account->email);
        $this->assertEquals('Test Gmail', $account->display_name);
        $this->assertEquals('active', $account->status);
        $this->assertTrue($account->is_default);
        $this->assertNotNull($account->connected_at);
    }

    public function test_connect_first_account_becomes_default(): void
    {
        $account = $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'google',
            'email' => 'first@gmail.com',
            'access_token' => 'token',
        ]);

        $this->assertTrue($account->is_default);
    }

    public function test_connect_second_account_does_not_override_default(): void
    {
        $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'google',
            'email' => 'first@gmail.com',
            'access_token' => 'token-1',
        ]);

        $second = $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'microsoft',
            'email' => 'second@outlook.com',
            'access_token' => 'token-2',
        ]);

        $this->assertFalse($second->is_default);

        $this->assertDatabaseHas('email_accounts', [
            'email' => 'first@gmail.com',
            'is_default' => true,
        ]);
    }

    public function test_connect_explicit_default_overrides_existing(): void
    {
        $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'google',
            'email' => 'first@gmail.com',
            'access_token' => 'token-1',
        ]);

        $second = $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'microsoft',
            'email' => 'second@outlook.com',
            'access_token' => 'token-2',
            'is_default' => true,
        ]);

        $this->assertTrue($second->is_default);

        $this->assertDatabaseHas('email_accounts', [
            'email' => 'first@gmail.com',
            'is_default' => false,
        ]);
    }

    public function test_connect_rejects_duplicate_email(): void
    {
        $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'google',
            'email' => 'test@gmail.com',
            'access_token' => 'token-1',
        ]);

        $this->expectException(\Illuminate\Validation\ValidationException::class);

        $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'google',
            'email' => 'test@gmail.com',
            'access_token' => 'token-2',
        ]);
    }

    public function test_connect_rejects_unsupported_provider(): void
    {
        $this->expectException(\Illuminate\Validation\ValidationException::class);

        $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'yahoo',
            'email' => 'test@yahoo.com',
            'access_token' => 'token',
        ]);
    }

    public function test_connect_rejects_invalid_email(): void
    {
        $this->expectException(\Illuminate\Validation\ValidationException::class);

        $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'google',
            'email' => 'not-an-email',
            'access_token' => 'token',
        ]);
    }

    public function test_disconnect_clears_tokens_and_soft_deletes(): void
    {
        $account = $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'google',
            'email' => 'test@gmail.com',
            'access_token' => 'token',
            'refresh_token' => 'refresh',
        ]);

        $accountId = $account->id;
        $this->service->disconnect($this->user, $account, $this->company->id);

        $this->assertSoftDeleted('email_accounts', [
            'id' => $accountId,
        ]);

        $trashed = EmailAccount::withTrashed()->findOrFail($accountId);
        $this->assertEquals('disconnected', $trashed->status);
        $this->assertNotNull($trashed->disconnected_at);
        $this->assertNull($trashed->access_token_encrypted);
        $this->assertNull($trashed->refresh_token_encrypted);
        $this->assertSame(0, EmailAccount::query()->where('user_id', $this->user->id)->count());
    }

    public function test_list_excludes_disconnected_accounts(): void
    {
        $active = $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'google',
            'email' => 'keep@gmail.com',
            'access_token' => 'token-keep',
        ]);

        $removed = $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'google',
            'email' => 'remove@gmail.com',
            'access_token' => 'token-remove',
        ]);

        $this->service->disconnect($this->user, $removed, $this->company->id);

        $listed = $this->service->listForUser($this->user, $this->company->id);

        $this->assertCount(1, $listed);
        $this->assertTrue($listed->contains('id', $active->id));
        $this->assertFalse($listed->contains('id', $removed->id));
    }

    public function test_set_default_switches_default_flag(): void
    {
        $account1 = $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'google',
            'email' => 'primary@gmail.com',
            'access_token' => 'token-1',
        ]);

        $account2 = $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'microsoft',
            'email' => 'secondary@outlook.com',
            'access_token' => 'token-2',
        ]);

        $result = $this->service->setDefault($this->user, $account2, $this->company->id);

        $this->assertTrue($result->is_default);
        $this->assertDatabaseHas('email_accounts', [
            'id' => $account1->id,
            'is_default' => false,
        ]);
        $this->assertDatabaseHas('email_accounts', [
            'id' => $account2->id,
            'is_default' => true,
        ]);
    }

    public function test_rename_updates_display_name(): void
    {
        $account = $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'google',
            'email' => 'test@gmail.com',
            'access_token' => 'token',
            'display_name' => 'Old Name',
        ]);

        $result = $this->service->rename($this->user, $account, 'New Name', $this->company->id);

        $this->assertEquals('New Name', $result->display_name);
        $this->assertDatabaseHas('email_accounts', [
            'id' => $account->id,
            'display_name' => 'New Name',
        ]);
    }

    public function test_refresh_tokens_updates_and_clears_errors(): void
    {
        $account = $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'google',
            'email' => 'test@gmail.com',
            'access_token' => 'old-token',
            'refresh_token' => 'old-refresh',
        ]);

        // First mark as error
        $this->service->markError($account, 'Previous error');
        $account->refresh();
        $this->assertEquals('error', $account->status);

        // Then refresh tokens
        $result = $this->service->refreshTokens(
            $this->user,
            $account,
            'new-access-token',
            'new-refresh-token',
            now()->addHour()->toIso8601String(),
            $this->company->id,
        );

        $this->assertEquals('active', $result->status);
        $this->assertNull($result->last_error_message);
        $this->assertNull($result->last_error_at);
        $this->assertNotNull($result->last_token_refresh_at);
    }

    public function test_mark_error_sets_error_state(): void
    {
        $account = $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'google',
            'email' => 'test@gmail.com',
            'access_token' => 'token',
        ]);

        $this->service->markError($account, 'Token expired');

        $account->refresh();

        $this->assertEquals('error', $account->status);
        $this->assertEquals('Token expired', $account->last_error_message);
        $this->assertNotNull($account->last_error_at);
    }

    public function test_update_sync_state_sets_history_id_and_timestamp(): void
    {
        $account = $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'google',
            'email' => 'test@gmail.com',
            'access_token' => 'token',
        ]);

        $this->service->updateSyncState($account, 'history-12345');

        $account->refresh();

        $this->assertEquals('history-12345', $account->history_id);
        $this->assertNotNull($account->last_synced_at);
    }

    public function test_get_default_account_returns_default_first(): void
    {
        $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'microsoft',
            'email' => 'secondary@outlook.com',
            'access_token' => 'token-2',
        ]);

        $default = $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'google',
            'email' => 'primary@gmail.com',
            'access_token' => 'token-1',
            'is_default' => true,
        ]);

        $result = $this->service->getDefaultAccount($this->user, $this->company->id);

        $this->assertNotNull($result);
        $this->assertEquals($default->id, $result->id);
        $this->assertEquals('primary@gmail.com', $result->email);
    }

    public function test_get_default_account_falls_back_to_first_active(): void
    {
        $account = $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'google',
            'email' => 'only@gmail.com',
            'access_token' => 'token',
        ]);

        // Unset default
        $account->update(['is_default' => false]);

        $result = $this->service->getDefaultAccount($this->user, $this->company->id);

        $this->assertNotNull($result);
        $this->assertEquals($account->id, $result->id);
    }

    public function test_get_default_account_returns_null_when_no_active_accounts(): void
    {
        $account = $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'google',
            'email' => 'test@gmail.com',
            'access_token' => 'token',
        ]);

        $this->service->disconnect($this->user, $account, $this->company->id);

        $result = $this->service->getDefaultAccount($this->user, $this->company->id);

        $this->assertNull($result);
    }

    public function test_resolve_provider_returns_google_provider(): void
    {
        $account = $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'google',
            'email' => 'test@gmail.com',
            'access_token' => 'token',
        ]);

        $provider = $this->service->resolveProvider($account);

        $this->assertInstanceOf(\App\Services\Email\Providers\GoogleProvider::class, $provider);
    }

    public function test_resolve_provider_returns_microsoft_provider(): void
    {
        $account = $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'microsoft',
            'email' => 'test@outlook.com',
            'access_token' => 'token',
        ]);

        $provider = $this->service->resolveProvider($account);

        $this->assertInstanceOf(\App\Services\Email\Providers\MicrosoftProvider::class, $provider);
    }

    public function test_resolve_provider_returns_zoho_provider(): void
    {
        $account = $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'zoho',
            'email' => 'test@zoho.com',
            'access_token' => 'token',
        ]);

        $provider = $this->service->resolveProvider($account);

        $this->assertInstanceOf(\App\Services\Email\Providers\ZohoProvider::class, $provider);
    }

    public function test_resolve_provider_returns_imap_smtp_provider(): void
    {
        $account = $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'imap_smtp',
            'email' => 'test@custom.com',
            'smtp_host' => 'smtp.custom.com',
            'smtp_port' => 587,
            'smtp_encryption' => 'tls',
            'smtp_username' => 'test@custom.com',
            'smtp_password' => 'smtp-pass',
            'imap_host' => 'imap.custom.com',
            'imap_port' => 993,
            'imap_encryption' => 'ssl',
            'imap_username' => 'test@custom.com',
            'imap_password' => 'imap-pass',
        ]);

        $provider = $this->service->resolveProvider($account);

        $this->assertInstanceOf(\App\Services\Email\Providers\ImapSmtpProvider::class, $provider);
    }

    public function test_assert_account_belongs_to_user_blocks_wrong_user(): void
    {
        $account = $this->service->connect($this->user, [
            'company_id' => $this->company->id,
            'provider' => 'google',
            'email' => 'test@gmail.com',
            'access_token' => 'token',
        ]);

        $otherUser = User::factory()->create(['email_verified_at' => now()]);

        $this->expectException(\Illuminate\Validation\ValidationException::class);

        // Attempt to disconnect as a different user
        $this->service->disconnect($otherUser, $account, $this->company->id);
    }
}
