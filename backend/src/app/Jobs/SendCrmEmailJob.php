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

class SendCrmEmailJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 3;

    /** @var list<int> */
    public array $backoff = [15, 60, 180];

    public function __construct(
        public readonly int $messageId,
        public readonly ?string $inReplyToGmailMessageId = null,
    ) {
        $this->onQueue('email-sync');
    }

    public function handle(CrmEmailService $crmEmailService): void
    {
        try {
            $crmEmailService->sendMessageById($this->messageId, $this->inReplyToGmailMessageId);
        } catch (\Throwable $exception) {
            Log::error('CRM email send job failed.', [
                'message_id' => $this->messageId,
                'error' => $exception->getMessage(),
            ]);

            throw $exception;
        }
    }
}
