<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\EmailAccount;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * Dispatch a SyncEmailAccountJob for every active email account in a company.
 *
 * This replaces the old SyncCompanyGmailJob and SyncUserGmailJob by iterating
 * over all EmailAccount records and dispatching per-account sync jobs.
 * Each account syncs independently via its own provider.
 */
class SyncAllEmailAccountsJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 1;

    public function __construct(
        public readonly int $companyId,
    ) {
        $this->onQueue('email-sync');
    }

    public function handle(): void
    {
        $accounts = EmailAccount::query()
            ->where('company_id', $this->companyId)
            ->where('status', 'active')
            ->get();

        if ($accounts->isEmpty()) {
            Log::info('No active email accounts to sync for company.', [
                'company_id' => $this->companyId,
            ]);

            return;
        }

        foreach ($accounts as $account) {
            SyncEmailAccountJob::dispatch((int) $account->id);
        }

        Log::info('Dispatched email account sync jobs.', [
            'company_id' => $this->companyId,
            'account_count' => $accounts->count(),
        ]);
    }
}
