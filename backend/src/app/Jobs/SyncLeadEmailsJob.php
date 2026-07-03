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

class SyncLeadEmailsJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 2;

    public function __construct(
        public readonly int $companyId,
        public readonly int $leadId,
        public readonly ?int $userId = null,
    ) {
        $this->onQueue('email-sync');
    }

    public function handle(CrmEmailService $crmEmailService): void
    {
        try {
            $crmEmailService->syncLead($this->companyId, $this->leadId, $this->userId);
        } catch (\Throwable $exception) {
            Log::warning('Lead email sync failed.', [
                'company_id' => $this->companyId,
                'lead_id' => $this->leadId,
                'user_id' => $this->userId,
                'error' => $exception->getMessage(),
            ]);
        }
    }
}
