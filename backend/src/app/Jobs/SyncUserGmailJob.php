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

class SyncUserGmailJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 2;

    public function __construct(
        public readonly int $companyId,
        public readonly int $userId,
    ) {
        $this->onQueue('email-sync');
    }

    public function handle(CrmEmailService $crmEmailService): void
    {
        try {
            $crmEmailService->syncUser($this->companyId, $this->userId);
        } catch (\Throwable $exception) {
            Log::warning('User Gmail sync failed.', [
                'company_id' => $this->companyId,
                'user_id' => $this->userId,
                'error' => $exception->getMessage(),
            ]);
        }
    }
}
