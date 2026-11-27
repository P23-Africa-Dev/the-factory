<?php

declare(strict_types=1);

namespace Tests\Feature\Crm;

use App\Jobs\SyncAllEmailAccountsJob;
use App\Jobs\SyncEmailAccountJob;
use App\Models\Company;
use App\Models\EmailAccount;
use App\Models\User;
use App\Services\Crm\CrmEmailService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Mockery;
use Tests\TestCase;

/**
 * crm:sync-gmail (scheduled every 10 minutes) syncs every connected Email
 * Account for all providers. The legacy calendar-connection Gmail jobs it used
 * to dispatch were replaced by per-account jobs.
 */
class SyncGmailCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_crm_sync_gmail_dispatches_one_sync_job_per_company_with_active_accounts(): void
    {
        Bus::fake();

        [$companyA, $userA] = $this->seedCompanyWithUser('FAC-SYNC001');
        [$companyB, $userB] = $this->seedCompanyWithUser('FAC-SYNC002');
        [$companyC, $userC] = $this->seedCompanyWithUser('FAC-SYNC003');

        $this->seedAccount($companyA, $userA, 'google', 'a1@example.com', true);
        $this->seedAccount($companyA, $userA, 'microsoft', 'a2@example.com', false);
        $this->seedAccount($companyB, $userB, 'imap_smtp', 'b1@example.com', true);
        $this->seedAccount($companyC, $userC, 'google', 'c1@example.com', true, 'error');

        Artisan::call('crm:sync-gmail');

        Bus::assertDispatchedTimes(SyncAllEmailAccountsJob::class, 2);
        Bus::assertDispatched(SyncAllEmailAccountsJob::class, fn (SyncAllEmailAccountsJob $job): bool => $job->companyId === $companyA->id);
        Bus::assertDispatched(SyncAllEmailAccountsJob::class, fn (SyncAllEmailAccountsJob $job): bool => $job->companyId === $companyB->id);
        Bus::assertNotDispatched(SyncAllEmailAccountsJob::class, fn (SyncAllEmailAccountsJob $job): bool => $job->companyId === $companyC->id);
    }

    public function test_company_sync_dispatches_a_job_for_every_active_account(): void
    {
        Bus::fake();

        [$company, $user] = $this->seedCompanyWithUser('FAC-SYNC010');
        $gmail = $this->seedAccount($company, $user, 'google', 'g@example.com', true);
        $outlook = $this->seedAccount($company, $user, 'microsoft', 'o@example.com', false);
        $this->seedAccount($company, $user, 'zoho', 'z@example.com', false, 'disconnected');

        (new SyncAllEmailAccountsJob($company->id))->handle();

        Bus::assertDispatchedTimes(SyncEmailAccountJob::class, 2);
        Bus::assertDispatched(SyncEmailAccountJob::class, fn (SyncEmailAccountJob $job): bool => $job->emailAccountId === $gmail->id);
        Bus::assertDispatched(SyncEmailAccountJob::class, fn (SyncEmailAccountJob $job): bool => $job->emailAccountId === $outlook->id);
    }

    public function test_account_sync_job_syncs_that_account_not_the_users_default(): void
    {
        [$company, $user] = $this->seedCompanyWithUser('FAC-SYNC020');
        $this->seedAccount($company, $user, 'google', 'default@example.com', true);
        $outlook = $this->seedAccount($company, $user, 'microsoft', 'second@example.com', false);

        $service = Mockery::mock(CrmEmailService::class);
        $service->shouldReceive('syncAccount')
            ->once()
            ->withArgs(fn (EmailAccount $account): bool => $account->id === $outlook->id);
        $service->shouldNotReceive('syncUser');

        (new SyncEmailAccountJob($outlook->id))->handle($service);

        $this->addToAssertionCount(1);
    }

    public function test_history_cursor_column_holds_long_microsoft_delta_links(): void
    {
        $this->assertSame('text', Schema::getColumnType('email_accounts', 'history_id'));

        [$company, $user] = $this->seedCompanyWithUser('FAC-SYNC030');
        $account = $this->seedAccount($company, $user, 'microsoft', 'delta@example.com', true);

        $deltaLink = 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken='.str_repeat('a', 600);
        $account->update(['history_id' => $deltaLink]);

        $this->assertSame($deltaLink, $account->fresh()->history_id);
    }

    /**
     * @return array{0:Company,1:User}
     */
    private function seedCompanyWithUser(string $code): array
    {
        $company = Company::create([
            'company_id' => $code,
            'name' => 'Sync Company '.$code,
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

    private function seedAccount(
        Company $company,
        User $user,
        string $provider,
        string $email,
        bool $isDefault,
        string $status = 'active',
    ): EmailAccount {
        return EmailAccount::query()->create([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'provider' => $provider,
            'email' => $email,
            'access_token_encrypted' => 'test-access-token',
            'refresh_token_encrypted' => 'test-refresh-token',
            'token_expires_at' => now()->addHour(),
            'is_default' => $isDefault,
            'status' => $status,
            'connected_at' => now(),
        ]);
    }
}
