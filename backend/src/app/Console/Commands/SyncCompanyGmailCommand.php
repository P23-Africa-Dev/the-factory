<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Jobs\SyncAllEmailAccountsJob;
use App\Models\EmailAccount;
use Illuminate\Console\Command;

class SyncCompanyGmailCommand extends Command
{
    protected $signature = 'crm:sync-gmail';

    protected $description = 'Dispatch email sync jobs for all connected email accounts across providers';

    public function handle(): int
    {
        $companyIds = EmailAccount::query()
            ->where('status', 'active')
            ->distinct()
            ->pluck('company_id');

        foreach ($companyIds as $companyId) {
            SyncAllEmailAccountsJob::dispatch((int) $companyId);
        }

        $accountCount = EmailAccount::query()
            ->where('status', 'active')
            ->count();

        $this->info(
            'Dispatched email sync for '
                . $companyIds->count()
                . ' companies covering '
                . $accountCount
                . ' active email accounts.'
        );

        return self::SUCCESS;
    }
}
