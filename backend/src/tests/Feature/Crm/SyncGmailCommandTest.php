<?php

declare(strict_types=1);

namespace Tests\Feature\Crm;

use App\Jobs\SyncCompanyGmailJob;
use App\Jobs\SyncUserGmailJob;
use App\Models\Company;
use App\Models\CompanyCalendarConnection;
use App\Models\User;
use App\Models\UserCalendarConnection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SyncGmailCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_crm_sync_gmail_dispatches_company_and_user_sync_jobs(): void
    {
        Bus::fake();

        $company = Company::create([
            'company_id' => 'FAC-SYNC001',
            'name' => 'Sync Company',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'CRM',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $owner = User::factory()->create(['email_verified_at' => now()]);
        $agent = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            [
                'company_id' => $company->id,
                'user_id' => $owner->id,
                'role' => 'owner',
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

        CompanyCalendarConnection::query()->create([
            'company_id' => $company->id,
            'owner_user_id' => $owner->id,
            'organizer_email' => 'owner@gmail.com',
            'organizer_google_user_id' => 'google-company-owner',
            'access_token_encrypted' => 'company-access-token',
            'refresh_token_encrypted' => 'company-refresh-token',
            'token_expires_at' => now()->addHour(),
            'scopes' => [
                'https://www.googleapis.com/auth/gmail.send',
                'https://www.googleapis.com/auth/gmail.modify',
            ],
            'status' => 'active',
            'connected_at' => now(),
        ]);

        UserCalendarConnection::query()->create([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'organizer_email' => 'agent@gmail.com',
            'organizer_google_user_id' => 'google-user-agent',
            'access_token_encrypted' => 'user-access-token',
            'refresh_token_encrypted' => 'user-refresh-token',
            'token_expires_at' => now()->addHour(),
            'scopes' => [
                'https://www.googleapis.com/auth/gmail.send',
                'https://www.googleapis.com/auth/gmail.modify',
            ],
            'status' => 'active',
            'connected_at' => now(),
        ]);

        Artisan::call('crm:sync-gmail');

        Bus::assertDispatched(SyncCompanyGmailJob::class);
        Bus::assertDispatched(SyncUserGmailJob::class, function (SyncUserGmailJob $job) use ($company, $agent): bool {
            return $job->companyId === $company->id && $job->userId === $agent->id;
        });
    }
}
