<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\EmailAccount;
use App\Services\Crm\CrmEmailService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * Sync a single email account's history using the provider's history/delta API.
 *
 * Dispatched per-account so different providers (Google, Microsoft, Zoho, IMAP)
 * can sync independently without blocking each other.
 */
class SyncEmailAccountJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 2;

    /** @var list<int> */
    public array $backoff = [30, 120];

    public function __construct(
        public readonly int $emailAccountId,
    ) {
        $this->onQueue('email-sync');
    }

    public function handle(CrmEmailService $crmEmailService): void
    {
        $emailAccount = EmailAccount::query()->find($this->emailAccountId);

        if ($emailAccount === null) {
            Log::info('Email account not found for sync, skipping.', [
                'email_account_id' => $this->emailAccountId,
            ]);

            return;
        }

        if ($emailAccount->status !== 'active') {
            Log::info('Email account is not active, skipping sync.', [
                'email_account_id' => $emailAccount->id,
                'email' => $emailAccount->email,
                'status' => $emailAccount->status,
            ]);

            return;
        }

        try {
            $crmEmailService->syncUser(
                (int) $emailAccount->company_id,
                (int) $emailAccount->user_id,
            );

            Log::info('Email account sync completed.', [
                'email_account_id' => $emailAccount->id,
                'email' => $emailAccount->email,
                'provider' => $emailAccount->provider,
            ]);
        } catch (\Throwable $exception) {
            Log::warning('Email account sync failed.', [
                'email_account_id' => $emailAccount->id,
                'email' => $emailAccount->email,
                'provider' => $emailAccount->provider,
                'error' => $exception->getMessage(),
            ]);
        }
    }
}
