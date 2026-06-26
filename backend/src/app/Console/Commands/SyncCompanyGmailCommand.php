<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Jobs\SyncCompanyGmailJob;
use App\Models\CompanyCalendarConnection;
use App\Services\Google\GoogleScopeHelper;
use Illuminate\Console\Command;

class SyncCompanyGmailCommand extends Command
{
    protected $signature = 'crm:sync-gmail';

    protected $description = 'Dispatch Gmail sync jobs for all connected companies';

    public function handle(): int
    {
        $companyIds = CompanyCalendarConnection::query()
            ->where('status', 'active')
            ->whereNull('disconnected_at')
            ->get()
            ->filter(fn (CompanyCalendarConnection $connection): bool => GoogleScopeHelper::connectionHasGmailScopes($connection))
            ->pluck('company_id');

        foreach ($companyIds as $companyId) {
            SyncCompanyGmailJob::dispatch((int) $companyId);
        }

        $this->info('Dispatched Gmail sync for ' . $companyIds->count() . ' companies.');

        return self::SUCCESS;
    }
}
