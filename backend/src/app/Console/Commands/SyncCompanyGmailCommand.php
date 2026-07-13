<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Jobs\SyncCompanyGmailJob;
use App\Jobs\SyncUserGmailJob;
use App\Models\CompanyCalendarConnection;
use App\Models\UserCalendarConnection;
use App\Services\Google\GoogleScopeHelper;
use Illuminate\Console\Command;

class SyncCompanyGmailCommand extends Command
{
    protected $signature = 'crm:sync-gmail';

    protected $description = 'Dispatch Gmail sync jobs for connected company and user mailboxes';

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

        $userConnections = UserCalendarConnection::query()
            ->where('status', 'active')
            ->whereNull('disconnected_at')
            ->get()
            ->filter(fn (UserCalendarConnection $connection): bool => GoogleScopeHelper::connectionHasGmailScopes($connection));

        foreach ($userConnections as $connection) {
            SyncUserGmailJob::dispatch((int) $connection->company_id, (int) $connection->user_id);
        }

        $this->info(
            'Dispatched Gmail sync for '
            . $companyIds->count()
            . ' companies and '
            . $userConnections->count()
            . ' user mailboxes.'
        );

        return self::SUCCESS;
    }
}
