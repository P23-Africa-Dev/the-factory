<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\CrmEmailAttachment;
use App\Models\EmailAccount;
use App\Services\Email\EmailAccountService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class ProcessEmailAttachmentJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 3;

    public function __construct(
        public readonly int $attachmentId,
    ) {
        $this->onQueue('email-attachments');
    }

    public function handle(EmailAccountService $emailAccountService): void
    {
        $attachment = CrmEmailAttachment::query()->with('message')->find($this->attachmentId);

        if ($attachment === null) {
            return;
        }

        if ($attachment->sync_status === 'synced' || $attachment->sync_status === 'uploaded') {
            if ($attachment->storage_path !== null) {
                return;
            }
        }

        if ($attachment->gmail_attachment_id === null || $attachment->gmail_message_id === null) {
            return;
        }

        $message = $attachment->message;
        $accountEmail = strtolower((string) ($message?->gmail_account_email ?? ''));

        $emailAccount = null;

        if ($accountEmail !== '') {
            $emailAccount = EmailAccount::query()
                ->where('company_id', $attachment->company_id)
                ->where('email', $accountEmail)
                ->where('status', 'active')
                ->first();
        }

        // Fallback: account owned by the sender of the CRM message.
        if ($emailAccount === null && $message?->sent_by_user_id) {
            $emailAccount = EmailAccount::query()
                ->where('company_id', $attachment->company_id)
                ->where('user_id', $message->sent_by_user_id)
                ->where('status', 'active')
                ->orderByDesc('is_default')
                ->first();
        }

        if ($emailAccount === null) {
            $attachment->update(['sync_status' => 'failed']);

            return;
        }

        try {
            $provider = $emailAccountService->resolveProvider($emailAccount);
            $accountDTO = $emailAccount->toDTO();

            $binary = $provider->getAttachment(
                $accountDTO,
                (string) $attachment->gmail_message_id,
                (string) $attachment->gmail_attachment_id,
            );

            $path = 'crm-email-attachments/company-' . $attachment->company_id . '/provider/' . $attachment->id . '-' . $attachment->filename;
            Storage::disk('local')->put($path, $binary);

            $attachment->update([
                'storage_disk' => 'local',
                'storage_path' => $path,
                'sync_status' => 'synced',
            ]);
        } catch (\Throwable $exception) {
            Log::warning('Email attachment processing failed.', [
                'attachment_id' => $attachment->id,
                'email_account_id' => $emailAccount->id,
                'error' => $exception->getMessage(),
            ]);

            $attachment->update(['sync_status' => 'failed']);
        }
    }
}
