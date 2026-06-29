<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Services\Crm\CrmEmailService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class SyncCompanyGmailJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 2;

    public function __construct(
        public readonly int $companyId,
    ) {
        $this->onQueue('email-sync');
    }

    public function handle(CrmEmailService $crmEmailService): void
    {
        try {
            $crmEmailService->syncCompany($this->companyId);
        } catch (\Throwable $exception) {
            Log::warning('Company Gmail sync failed.', [
                'company_id' => $this->companyId,
                'error' => $exception->getMessage(),
            ]);
        }
    }
}
