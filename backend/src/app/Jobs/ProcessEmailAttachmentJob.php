<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\CrmEmailAttachment;
use App\Models\CompanyCalendarConnection;
use App\Services\Google\GmailApiService;
use App\Services\Google\GoogleScopeHelper;
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

    public function handle(GmailApiService $gmailApiService): void
    {
        $attachment = CrmEmailAttachment::query()->find($this->attachmentId);

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

        $connection = CompanyCalendarConnection::query()
            ->where('company_id', $attachment->company_id)
            ->where('status', 'active')
            ->whereNull('disconnected_at')
            ->first();

        if ($connection === null || ! GoogleScopeHelper::connectionHasGmailScopes($connection)) {
            $attachment->update(['sync_status' => 'failed']);

            return;
        }

        try {
            $binary = $gmailApiService->getAttachment(
                $connection,
                (string) $attachment->gmail_message_id,
                (string) $attachment->gmail_attachment_id,
            );

            $path = 'crm-email-attachments/company-' . $attachment->company_id . '/gmail/' . $attachment->id . '-' . $attachment->filename;
            Storage::disk('local')->put($path, $binary);

            $attachment->update([
                'storage_disk' => 'local',
                'storage_path' => $path,
                'sync_status' => 'synced',
            ]);
        } catch (\Throwable $exception) {
            Log::warning('Email attachment processing failed.', [
                'attachment_id' => $attachment->id,
                'error' => $exception->getMessage(),
            ]);

            $attachment->update(['sync_status' => 'failed']);
        }
    }
}
