<?php

declare(strict_types=1);

namespace App\Services\Crm;

use App\Enums\CrmEmailDirection;
use App\Enums\CrmEmailStatus;
use App\Jobs\ProcessEmailAttachmentJob;
use App\Jobs\SendCrmEmailJob;
use App\Jobs\SyncLeadEmailsJob;
use App\Models\CrmEmailActivityLog;
use App\Models\CrmEmailAttachment;
use App\Models\CrmEmailMessage;
use App\Models\CrmEmailThread;
use App\Models\EmailAccount;
use App\Models\Lead;
use App\Models\User;
use App\Services\Analytics\AggregateCacheService;
use App\Services\Company\CompanyContextService;
use App\Services\Email\EmailAccountDTO;
use App\Services\Email\EmailAccountService;
use App\Services\Email\EmailMessageDTO;
use App\Services\Email\EmailProviderInterface;
use App\Services\Email\ParsedEmailDTO;
use App\Services\Google\StaleGmailHistoryException;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CrmEmailService
{
    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly EmailAccountService $emailAccountService,
        private readonly AggregateCacheService $cacheService,
    ) {}

    public function listThreadsForLead(
        User $user,
        Lead $lead,
        array $filters = [],
    ): LengthAwarePaginator {
        $context = $this->authorizeLeadAccess($user, $lead, $filters['company_id'] ?? null);
        $companyId = (int) $context['company']->id;

        if (! empty($filters['sync'])) {
            SyncLeadEmailsJob::dispatch($companyId, (int) $lead->id, (int) $user->id);
        }

        $perPage = max(1, min(50, (int) ($filters['per_page'] ?? 20)));

        return CrmEmailThread::query()
            ->where('company_id', $companyId)
            ->where('lead_id', $lead->id)
            ->whereHas('messages')
            ->with(['messages' => fn($q) => $this->applyMessageTimelineOrder($q)])
            ->orderByDesc('last_message_at')
            ->paginate($perPage)
            ->withQueryString();
    }

    public function getThreadForLead(User $user, Lead $lead, CrmEmailThread $thread, ?int $companyId = null): CrmEmailThread
    {
        $context = $this->authorizeLeadAccess($user, $lead, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $this->assertThreadBelongsToLead($thread, $resolvedCompanyId, (int) $lead->id);

        return $thread->load([
            'messages' => fn($q) => $this->applyMessageTimelineOrder(
                $q->with(['attachments', 'sentBy:id,name,email']),
            ),
        ]);
    }

    /**
     * Queue an email for sending via the user's selected email account.
     *
     * @param  array<string,mixed>  $data
     */
    public function queueSend(User $user, Lead $lead, array $data): CrmEmailMessage
    {
        $context = $this->authorizeLeadAccess($user, $lead, $data['company_id'] ?? null);
        $companyId = (int) $context['company']->id;

        // Resolve the email account to send from
        $emailAccount = $this->resolveSendingAccount($user, $companyId, $data);

        $to = $this->normalizeRecipients($data['to'] ?? []);
        $cc = $this->normalizeRecipients($data['cc'] ?? []);
        $bcc = $this->normalizeRecipients($data['bcc'] ?? []);

        if ($to === []) {
            throw ValidationException::withMessages([
                'to' => ['At least one recipient is required.'],
            ]);
        }

        $subject = trim((string) ($data['subject'] ?? ''));
        $bodyText = trim((string) ($data['body_text'] ?? ''));
        $bodyHtml = trim((string) ($data['body_html'] ?? ''));

        if ($subject === '' || ($bodyText === '' && $bodyHtml === '')) {
            throw ValidationException::withMessages([
                'email' => ['Subject and message body are required.'],
            ]);
        }

        if ($bodyHtml === '') {
            $bodyHtml = '<p>' . nl2br(e($bodyText)) . '</p>';
        }

        if ($bodyText === '') {
            $bodyText = strip_tags($bodyHtml);
        }

        $thread = null;
        $providerThreadId = isset($data['gmail_thread_id']) ? trim((string) $data['gmail_thread_id']) : null;

        if ($providerThreadId !== null && $providerThreadId !== '') {
            $thread = CrmEmailThread::query()
                ->where('company_id', $companyId)
                ->where('lead_id', $lead->id)
                ->where('gmail_thread_id', $providerThreadId)
                ->first();
        }

        if ($thread === null) {
            $thread = CrmEmailThread::query()->create([
                'company_id' => $companyId,
                'lead_id' => $lead->id,
                'gmail_thread_id' => 'pending-' . Str::uuid(),
                'subject' => $subject,
                'snippet' => Str::limit($bodyText, 180),
                'last_message_at' => now(),
                'unread_count' => 0,
                'message_count' => 0,
                'participant_emails' => $this->collectParticipantEmails($to, $cc, $bcc, $lead->email),
            ]);
        }

        $message = CrmEmailMessage::query()->create([
            'company_id' => $companyId,
            'thread_id' => $thread->id,
            'lead_id' => $lead->id,
            'gmail_message_id' => 'pending-' . Str::uuid(),
            'gmail_thread_id' => $thread->gmail_thread_id,
            'direction' => CrmEmailDirection::Sent,
            'status' => CrmEmailStatus::Sending,
            'from_name' => $emailAccount->display_name ?? $emailAccount->email,
            'from_email' => $emailAccount->email,
            'to_recipients' => $to,
            'cc_recipients' => $cc,
            'bcc_recipients' => $bcc,
            'subject' => $subject,
            'body_html' => $bodyHtml,
            'body_text' => $bodyText,
            'is_read' => true,
            'sent_by_user_id' => $user->id,
            'gmail_account_email' => $emailAccount->email,
            'sent_at' => now(),
        ]);

        $attachmentIds = array_map('intval', is_array($data['attachment_ids'] ?? null) ? $data['attachment_ids'] : []);
        $this->attachPendingUploads($message, $companyId, $attachmentIds);

        $this->logActivity($companyId, (int) $user->id, 'send_queued', [
            'message_id' => $message->id,
            'thread_id' => $thread->id,
            'lead_id' => $lead->id,
            'subject' => $subject,
            'to' => $to,
            'cc' => $cc,
            'bcc' => $bcc,
            'email_account_id' => $emailAccount->id,
            'email_account_email' => $emailAccount->email,
            'provider' => $emailAccount->provider,
        ], $message->id, $thread->id, (int) $lead->id);

        SendCrmEmailJob::dispatch(
            (int) $message->id,
            isset($data['reply_to_gmail_message_id']) ? trim((string) $data['reply_to_gmail_message_id']) : null,
        );

        Log::info('CRM email queued for sending.', [
            'message_id' => $message->id,
            'company_id' => $companyId,
            'lead_id' => $lead->id,
            'user_id' => $user->id,
            'email_account_id' => $emailAccount->id,
            'provider' => $emailAccount->provider,
            'subject' => $subject,
        ]);

        $this->invalidateLeadCache($companyId, (int) $lead->id);
        $this->cacheService->bumpCompanyVersion($companyId);

        return $message->load(['attachments', 'sentBy:id,name,email', 'thread']);
    }

    /**
     * Send a queued message by its ID. Called from SendCrmEmailJob.
     */
    public function sendMessageById(int $messageId, ?string $inReplyToGmailMessageId = null): void
    {
        $message = CrmEmailMessage::query()->with(['thread', 'attachments'])->findOrFail($messageId);
        $companyId = (int) $message->company_id;
        $userId = (int) $message->sent_by_user_id;

        $emailAccount = $this->requireUserEmailAccount($companyId, $userId, (string) $message->gmail_account_email);
        $provider = $this->emailAccountService->resolveProvider($emailAccount);
        $accountDTO = $emailAccount->toDTO();

        $extraHeaders = [];
        $replyToMessageId = trim((string) ($inReplyToGmailMessageId ?? ''));

        if ($replyToMessageId !== '') {
            $extraHeaders[] = 'In-Reply-To: <' . $replyToMessageId . '>';
            $extraHeaders[] = 'References: <' . $replyToMessageId . '>';
        }

        $attachments = $message->attachments
            ->filter(fn(CrmEmailAttachment $attachment): bool => $attachment->storage_path !== null)
            ->map(function (CrmEmailAttachment $attachment): array {
                $content = Storage::disk($attachment->storage_disk)->get((string) $attachment->storage_path);

                return [
                    'filename' => $attachment->filename,
                    'mime_type' => $attachment->mime_type ?? 'application/octet-stream',
                    'content' => $content,
                ];
            })
            ->values()
            ->all();

        try {
            $threadId = str_starts_with((string) $message->gmail_thread_id, 'pending-')
                ? null
                : (string) $message->gmail_thread_id;

            $emailMessageDTO = new EmailMessageDTO(
                fromEmail: $emailAccount->email,
                fromName: $emailAccount->display_name,
                to: is_array($message->to_recipients) ? $message->to_recipients : [],
                cc: is_array($message->cc_recipients) ? $message->cc_recipients : [],
                bcc: is_array($message->bcc_recipients) ? $message->bcc_recipients : [],
                subject: (string) $message->subject,
                bodyHtml: (string) $message->body_html,
                bodyText: (string) $message->body_text,
                attachments: $attachments,
                threadId: $threadId,
                extraHeaders: $extraHeaders,
            );

            $result = $provider->send($accountDTO, $emailMessageDTO);

            $message->update([
                'gmail_message_id' => $result['id'],
                'gmail_thread_id' => $result['threadId'],
                'status' => CrmEmailStatus::Sent,
                'error_message' => null,
            ]);

            $message->thread?->update([
                'gmail_thread_id' => $result['threadId'],
                'subject' => $message->subject,
                'snippet' => Str::limit((string) $message->body_text, 180),
                'last_message_at' => now(),
            ]);
            $message->thread?->increment('message_count');

            $this->logActivity($companyId, $userId, 'send', [
                'message_id' => $message->id,
                'provider_message_id' => $result['id'],
                'provider_thread_id' => $result['threadId'],
                'subject' => $message->subject,
                'status' => 'sent',
                'email_account_id' => $emailAccount->id,
                'email_account_email' => $emailAccount->email,
                'provider' => $emailAccount->provider,
            ], $message->id, (int) $message->thread_id, (int) $message->lead_id);

            Log::info('CRM email sent successfully.', [
                'message_id' => $message->id,
                'company_id' => $companyId,
                'lead_id' => (int) $message->lead_id,
                'provider_message_id' => $result['id'],
                'provider' => $emailAccount->provider,
            ]);
        } catch (\Throwable $exception) {
            $message->update([
                'status' => CrmEmailStatus::Failed,
                'error_message' => $exception->getMessage(),
            ]);

            $this->logActivity($companyId, $userId, 'send_failed', [
                'message_id' => $message->id,
                'subject' => $message->subject,
                'status' => 'failed',
                'error' => $exception->getMessage(),
                'email_account_id' => $emailAccount->id,
                'provider' => $emailAccount->provider,
            ], $message->id, (int) $message->thread_id, (int) $message->lead_id);

            Log::error('CRM email send failed.', [
                'message_id' => $message->id,
                'company_id' => $companyId,
                'lead_id' => (int) $message->lead_id,
                'email_account_id' => $emailAccount->id,
                'provider' => $emailAccount->provider,
                'error' => $exception->getMessage(),
            ]);

            throw $exception;
        } finally {
            $this->invalidateLeadCache($companyId, (int) $message->lead_id);
            $this->cacheService->bumpCompanyVersion($companyId);
        }
    }

    /**
     * Sync emails for a specific lead using the user's connected email account.
     */
    public function syncLead(int $companyId, int $leadId, ?int $userId = null): void
    {
        if ($userId === null || $userId <= 0) {
            throw ValidationException::withMessages([
                'integration' => ['A connected email account is required to sync lead emails.'],
            ]);
        }

        $lead = Lead::query()->where('company_id', $companyId)->findOrFail($leadId);
        $email = strtolower(trim((string) ($lead->email ?? '')));

        if ($email === '') {
            return;
        }

        $emailAccount = $this->requireUserEmailAccount($companyId, $userId);
        $provider = $this->emailAccountService->resolveProvider($emailAccount);
        $accountDTO = $emailAccount->toDTO();

        Log::info('CRM lead email sync started.', [
            'company_id' => $companyId,
            'lead_id' => $leadId,
            'lead_email' => $email,
            'user_id' => $userId,
            'email_account_id' => $emailAccount->id,
            'provider' => $emailAccount->provider,
        ]);

        $this->logActivity($companyId, $userId, 'sync_started', [
            'lead_id' => $leadId,
            'lead_email' => $email,
            'email_account_id' => $emailAccount->id,
            'provider' => $emailAccount->provider,
        ], null, null, $leadId);

        $query = $this->buildLeadSyncQuery($emailAccount->provider, $email);
        $pageToken = null;
        $syncedCount = 0;

        try {
            do {
                $listing = $provider->listMessages($accountDTO, $query, $pageToken, 50);
                $messages = $listing['messages'];

                foreach ($messages as $item) {
                    $providerMessageId = (string) ($item['id'] ?? '');

                    if ($providerMessageId === '') {
                        continue;
                    }

                    $this->upsertEmailMessage($provider, $accountDTO, $emailAccount, $companyId, $providerMessageId, (int) $lead->id);
                    $syncedCount++;
                }

                $pageToken = $listing['nextPageToken'];
            } while ($pageToken !== null && $pageToken !== '');

            Log::info('CRM lead email sync completed.', [
                'company_id' => $companyId,
                'lead_id' => $leadId,
                'synced_count' => $syncedCount,
                'email_account_id' => $emailAccount->id,
                'provider' => $emailAccount->provider,
            ]);

            $this->logActivity($companyId, $userId, 'sync_completed', [
                'lead_id' => $leadId,
                'lead_email' => $email,
                'synced_count' => $syncedCount,
                'email_account_id' => $emailAccount->id,
                'provider' => $emailAccount->provider,
            ], null, null, $leadId);
        } catch (\Throwable $exception) {
            Log::error('CRM lead email sync failed.', [
                'company_id' => $companyId,
                'lead_id' => $leadId,
                'lead_email' => $email,
                'synced_count' => $syncedCount,
                'email_account_id' => $emailAccount->id,
                'provider' => $emailAccount->provider,
                'error' => $exception->getMessage(),
            ]);

            $this->logActivity($companyId, $userId, 'sync_failed', [
                'lead_id' => $leadId,
                'lead_email' => $email,
                'synced_count' => $syncedCount,
                'error' => $exception->getMessage(),
                'email_account_id' => $emailAccount->id,
                'provider' => $emailAccount->provider,
            ], null, null, $leadId);

            throw $exception;
        }

        $this->invalidateLeadCache($companyId, $leadId);
    }

    /**
     * Sync company-wide email history using the company's default email account.
     */
    public function syncCompany(int $companyId): void
    {
        $emailAccount = $this->requireCompanyEmailAccount($companyId);
        $this->syncAccountHistory($emailAccount, $companyId);
    }

    /**
     * Sync a specific user's email history.
     */
    public function syncUser(int $companyId, int $userId): void
    {
        $emailAccount = $this->requireUserEmailAccount($companyId, $userId);
        $this->syncAccountHistory($emailAccount, $companyId);
    }

    public function markAsRead(User $user, Lead $lead, CrmEmailMessage $message, ?int $companyId = null): CrmEmailMessage
    {
        $context = $this->authorizeLeadAccess($user, $lead, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $this->assertMessageBelongsToLead($message, $resolvedCompanyId, (int) $lead->id);

        if (! $message->is_read && ! str_starts_with((string) $message->gmail_message_id, 'pending-')) {
            $emailAccount = $this->requireUserEmailAccount($resolvedCompanyId, (int) $user->id);
            $provider = $this->emailAccountService->resolveProvider($emailAccount);

            try {
                $provider->markAsRead($emailAccount->toDTO(), (string) $message->gmail_message_id);
            } catch (\Throwable $exception) {
                Log::warning('CRM email mark-as-read provider call failed.', [
                    'message_id' => $message->id,
                    'company_id' => $resolvedCompanyId,
                    'lead_id' => (int) $lead->id,
                    'provider_message_id' => $message->gmail_message_id,
                    'email_account_id' => $emailAccount->id,
                    'provider' => $emailAccount->provider,
                    'error' => $exception->getMessage(),
                ]);
                // Continue — still mark as read locally even if provider call fails
            }
        }

        $message->update(['is_read' => true]);
        $message->thread?->decrement('unread_count');

        $this->logActivity($resolvedCompanyId, (int) $user->id, 'mark_read', [
            'message_id' => $message->id,
            'provider_message_id' => $message->gmail_message_id,
            'subject' => $message->subject,
            'thread_id' => (int) $message->thread_id,
            'lead_id' => (int) $lead->id,
        ], $message->id, (int) $message->thread_id, (int) $lead->id);

        return $message->fresh();
    }

    public function deleteMessage(User $user, Lead $lead, CrmEmailMessage $message, ?int $companyId = null): void
    {
        $context = $this->authorizeLeadAccess($user, $lead, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $this->assertMessageBelongsToLead($message, $resolvedCompanyId, (int) $lead->id);

        $threadId = (int) $message->thread_id;
        $providerMessageId = (string) $message->gmail_message_id;

        if ($providerMessageId !== '' && ! str_starts_with($providerMessageId, 'pending-')) {
            $emailAccount = $this->resolveEmailAccountForMessage(
                $resolvedCompanyId,
                (int) $user->id,
                $message,
            );
            $provider = $this->emailAccountService->resolveProvider($emailAccount);

            try {
                $provider->trashMessage($emailAccount->toDTO(), $providerMessageId);
            } catch (\Throwable $exception) {
                Log::warning('CRM email delete provider call failed.', [
                    'message_id' => $message->id,
                    'company_id' => $resolvedCompanyId,
                    'lead_id' => (int) $lead->id,
                    'provider_message_id' => $providerMessageId,
                    'email_account_id' => $emailAccount->id,
                    'provider' => $emailAccount->provider,
                    'error' => $exception->getMessage(),
                ]);
                // Continue — still delete locally even if provider call fails
            }
        }

        $message->delete();

        Log::info('CRM email deleted.', [
            'message_id' => $message->id,
            'company_id' => $resolvedCompanyId,
            'lead_id' => (int) $lead->id,
            'thread_id' => $threadId,
            'provider_message_id' => $providerMessageId,
        ]);

        $this->logActivity($resolvedCompanyId, (int) $user->id, 'delete', [
            'message_id' => $message->id,
            'provider_message_id' => $providerMessageId,
            'subject' => $message->subject,
            'thread_id' => $threadId,
            'lead_id' => (int) $lead->id,
        ], $message->id, $threadId, (int) $lead->id);

        $thread = CrmEmailThread::query()->find($threadId);
        if ($thread !== null) {
            $remaining = $thread->messages()->count();
            $thread->update([
                'message_count' => $remaining,
                'unread_count' => $thread->messages()->where('is_read', false)->count(),
                'last_message_at' => $remaining > 0
                    ? ($thread->messages()->max('sent_at')
                        ?? $thread->messages()->max('received_at')
                        ?? $thread->last_message_at)
                    : $thread->last_message_at,
            ]);
        }

        $this->invalidateLeadCache($resolvedCompanyId, (int) $lead->id);
    }

    public function markAsUnread(User $user, Lead $lead, CrmEmailMessage $message, ?int $companyId = null): CrmEmailMessage
    {
        $context = $this->authorizeLeadAccess($user, $lead, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $this->assertMessageBelongsToLead($message, $resolvedCompanyId, (int) $lead->id);

        $providerMessageId = (string) $message->gmail_message_id;
        if ($providerMessageId !== '' && ! str_starts_with($providerMessageId, 'pending-')) {
            $google = $this->requireGoogleProviderForMessage($resolvedCompanyId, (int) $user->id, $message);
            $google['provider']->markAsUnread($google['account']->toDTO(), $providerMessageId);
        }

        $message->update(['is_read' => false]);
        $message->thread?->increment('unread_count');

        $this->logActivity($resolvedCompanyId, (int) $user->id, 'mark_unread', [
            'message_id' => $message->id,
            'provider_message_id' => $providerMessageId,
            'subject' => $message->subject,
            'thread_id' => (int) $message->thread_id,
            'lead_id' => (int) $lead->id,
        ], $message->id, (int) $message->thread_id, (int) $lead->id);

        return $message->fresh();
    }

    public function moveMessageToInbox(User $user, Lead $lead, CrmEmailMessage $message, ?int $companyId = null): CrmEmailMessage
    {
        return $this->applyMailboxMove($user, $lead, $message, 'inbox', $companyId);
    }

    public function moveMessageToSpam(User $user, Lead $lead, CrmEmailMessage $message, ?int $companyId = null): CrmEmailMessage
    {
        return $this->applyMailboxMove($user, $lead, $message, 'spam', $companyId);
    }

    /**
     * @param  list<string>  $addLabelIds
     * @param  list<string>  $removeLabelIds
     * @return array{message:CrmEmailMessage,label_ids:list<string>}
     */
    public function modifyMessageLabels(
        User $user,
        Lead $lead,
        CrmEmailMessage $message,
        array $addLabelIds = [],
        array $removeLabelIds = [],
        ?int $companyId = null,
    ): array {
        $context = $this->authorizeLeadAccess($user, $lead, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $this->assertMessageBelongsToLead($message, $resolvedCompanyId, (int) $lead->id);

        $providerMessageId = (string) $message->gmail_message_id;
        if ($providerMessageId === '' || str_starts_with($providerMessageId, 'pending-')) {
            throw ValidationException::withMessages([
                'message' => ['This email is not yet synced with Gmail.'],
            ]);
        }

        $addLabelIds = $this->normalizeLabelIds($addLabelIds);
        $removeLabelIds = $this->normalizeLabelIds($removeLabelIds);
        if ($addLabelIds === [] && $removeLabelIds === []) {
            throw ValidationException::withMessages([
                'labels' => ['Provide at least one label to add or remove.'],
            ]);
        }

        $google = $this->requireGoogleProviderForMessage($resolvedCompanyId, (int) $user->id, $message);
        $payload = $google['provider']->modifyMessageLabels(
            $google['account']->toDTO(),
            $providerMessageId,
            $addLabelIds,
            $removeLabelIds,
        );

        $labelIds = [];
        if (is_array($payload['labelIds'] ?? null)) {
            $labelIds = array_values(array_filter(array_map(
                static fn (mixed $id): string => trim((string) $id),
                $payload['labelIds'],
            )));
        }

        if (in_array('UNREAD', $addLabelIds, true)) {
            $message->update(['is_read' => false]);
        }
        if (in_array('UNREAD', $removeLabelIds, true)) {
            $message->update(['is_read' => true]);
        }

        $this->logActivity($resolvedCompanyId, (int) $user->id, 'modify_labels', [
            'message_id' => $message->id,
            'provider_message_id' => $providerMessageId,
            'add_label_ids' => $addLabelIds,
            'remove_label_ids' => $removeLabelIds,
            'lead_id' => (int) $lead->id,
        ], $message->id, (int) $message->thread_id, (int) $lead->id);

        return [
            'message' => $message->fresh(),
            'label_ids' => $labelIds,
        ];
    }

    /**
     * @return list<array{id:string,name:string,type:string,messageListVisibility:?string,labelListVisibility:?string}>
     */
    public function listGmailLabels(User $user, ?int $companyId = null): array
    {
        $google = $this->requireGoogleProviderForUser($user, $companyId);

        return $google['provider']->listLabels($google['account']->toDTO());
    }

    /**
     * @return array{id:string,name:string,type:string,messageListVisibility:?string,labelListVisibility:?string}
     */
    public function createGmailLabel(User $user, string $name, ?int $companyId = null): array
    {
        $google = $this->requireGoogleProviderForUser($user, $companyId);
        $label = $google['provider']->createLabel($google['account']->toDTO(), $name);

        $this->logActivity((int) $google['account']->company_id, (int) $user->id, 'create_label', [
            'label_id' => $label['id'],
            'label_name' => $label['name'],
        ]);

        return $label;
    }

    /**
     * @return array{id:string,name:string,type:string,messageListVisibility:?string,labelListVisibility:?string}
     */
    public function updateGmailLabel(User $user, string $labelId, string $name, ?int $companyId = null): array
    {
        $google = $this->requireGoogleProviderForUser($user, $companyId);
        $label = $google['provider']->updateLabel($google['account']->toDTO(), $labelId, $name);

        $this->logActivity((int) $google['account']->company_id, (int) $user->id, 'update_label', [
            'label_id' => $label['id'],
            'label_name' => $label['name'],
        ]);

        return $label;
    }

    public function deleteGmailLabel(User $user, string $labelId, ?int $companyId = null): void
    {
        $google = $this->requireGoogleProviderForUser($user, $companyId);
        $google['provider']->deleteLabel($google['account']->toDTO(), $labelId);

        $this->logActivity((int) $google['account']->company_id, (int) $user->id, 'delete_label', [
            'label_id' => $labelId,
        ]);
    }

    /**
     * @return array{provider:\App\Services\Email\Providers\GoogleProvider,account:EmailAccount}
     */
    private function requireGoogleProviderForUser(User $user, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $emailAccount = $this->requireUserEmailAccount($resolvedCompanyId, (int) $user->id);

        return $this->requireGoogleProviderFromAccount($emailAccount);
    }

    /**
     * @return array{provider:\App\Services\Email\Providers\GoogleProvider,account:EmailAccount}
     */
    private function requireGoogleProviderForMessage(int $companyId, int $userId, CrmEmailMessage $message): array
    {
        $emailAccount = $this->resolveEmailAccountForMessage($companyId, $userId, $message);

        return $this->requireGoogleProviderFromAccount($emailAccount);
    }

    /**
     * @return array{provider:\App\Services\Email\Providers\GoogleProvider,account:EmailAccount}
     */
    private function requireGoogleProviderFromAccount(EmailAccount $emailAccount): array
    {
        if ($emailAccount->provider !== 'google') {
            throw ValidationException::withMessages([
                'provider' => ['Gmail mailbox actions require a connected Google account.'],
            ]);
        }

        $provider = $this->emailAccountService->resolveProvider($emailAccount);
        if (! $provider instanceof \App\Services\Email\Providers\GoogleProvider) {
            throw ValidationException::withMessages([
                'provider' => ['Gmail mailbox actions require a connected Google account.'],
            ]);
        }

        return [
            'provider' => $provider,
            'account' => $emailAccount,
        ];
    }

    private function applyMailboxMove(
        User $user,
        Lead $lead,
        CrmEmailMessage $message,
        string $destination,
        ?int $companyId = null,
    ): CrmEmailMessage {
        $context = $this->authorizeLeadAccess($user, $lead, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $this->assertMessageBelongsToLead($message, $resolvedCompanyId, (int) $lead->id);

        $providerMessageId = (string) $message->gmail_message_id;
        if ($providerMessageId === '' || str_starts_with($providerMessageId, 'pending-')) {
            throw ValidationException::withMessages([
                'message' => ['This email is not yet synced with Gmail.'],
            ]);
        }

        $google = $this->requireGoogleProviderForMessage($resolvedCompanyId, (int) $user->id, $message);
        if ($destination === 'spam') {
            $google['provider']->moveMessageToSpam($google['account']->toDTO(), $providerMessageId);
        } else {
            $google['provider']->moveMessageToInbox($google['account']->toDTO(), $providerMessageId);
        }

        $this->logActivity($resolvedCompanyId, (int) $user->id, 'move_' . $destination, [
            'message_id' => $message->id,
            'provider_message_id' => $providerMessageId,
            'subject' => $message->subject,
            'lead_id' => (int) $lead->id,
        ], $message->id, (int) $message->thread_id, (int) $lead->id);

        return $message->fresh();
    }

    /**
     * @param  list<mixed>  $labelIds
     * @return list<string>
     */
    private function normalizeLabelIds(array $labelIds): array
    {
        return array_values(array_unique(array_filter(array_map(
            static fn (mixed $id): string => trim((string) $id),
            $labelIds,
        ), static fn (string $id): bool => $id !== '')));
    }

    public function uploadAttachment(User $user, Lead $lead, UploadedFile $file, ?int $companyId = null): CrmEmailAttachment
    {
        $context = $this->authorizeLeadAccess($user, $lead, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;

        try {
            $path = Storage::disk('local')->putFile(
                'crm-email-attachments/company-' . $resolvedCompanyId . '/lead-' . $lead->id,
                $file,
            );
        } catch (\Throwable $exception) {
            Log::error('CRM email attachment storage failed.', [
                'company_id' => $resolvedCompanyId,
                'lead_id' => (int) $lead->id,
                'user_id' => (int) $user->id,
                'filename' => $file->getClientOriginalName(),
                'error' => $exception->getMessage(),
            ]);

            throw ValidationException::withMessages([
                'file' => ['Failed to store the attachment. Please try again.'],
            ]);
        }

        $attachment = CrmEmailAttachment::query()->create([
            'company_id' => $resolvedCompanyId,
            'uploaded_by_user_id' => $user->id,
            'filename' => $file->getClientOriginalName(),
            'mime_type' => $file->getClientMimeType() ?: 'application/octet-stream',
            'size_bytes' => (int) $file->getSize(),
            'storage_disk' => 'local',
            'storage_path' => $path,
            'sync_status' => 'uploaded',
        ]);

        Log::info('CRM email attachment uploaded.', [
            'attachment_id' => $attachment->id,
            'company_id' => $resolvedCompanyId,
            'lead_id' => (int) $lead->id,
            'user_id' => (int) $user->id,
            'filename' => $attachment->filename,
            'size_bytes' => $attachment->size_bytes,
        ]);

        $this->logActivity($resolvedCompanyId, (int) $user->id, 'upload_attachment', [
            'attachment_id' => $attachment->id,
            'filename' => $attachment->filename,
            'mime_type' => $attachment->mime_type,
            'size_bytes' => $attachment->size_bytes,
            'lead_id' => (int) $lead->id,
        ], null, null, (int) $lead->id);

        return $attachment;
    }

    public function downloadAttachment(User $user, CrmEmailAttachment $attachment, ?int $companyId = null): CrmEmailAttachment
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;

        if ($attachment->company_id !== $resolvedCompanyId) {
            throw ValidationException::withMessages([
                'attachment' => ['Attachment is outside your company context.'],
            ]);
        }

        if ($attachment->sync_status !== 'synced' && $attachment->sync_status !== 'uploaded') {
            ProcessEmailAttachmentJob::dispatchSync((int) $attachment->id);
            $attachment->refresh();
        }

        return $attachment;
    }

    /**
     * @return array<int,array<string,mixed>>
     */
    public function recentActivity(User $user, ?int $companyId = null, int $limit = 5): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $role = (string) $context['role'];

        $query = CrmEmailActivityLog::query()
            ->where('company_id', $resolvedCompanyId)
            ->with(['lead:id,name,email', 'user:id,name,email'])
            ->latest('id')
            ->limit($limit);

        if ($role === 'agent') {
            $query->whereHas('lead', function ($leadQuery) use ($user): void {
                $leadQuery->where(function ($builder) use ($user): void {
                    $builder->where('created_by_user_id', $user->id)
                        ->orWhere('assigned_to_user_id', $user->id);
                });
            });
        }

        return $query->get()->map(fn(CrmEmailActivityLog $log): array => [
            'id' => $log->id,
            'action' => $log->action,
            'metadata' => $log->metadata,
            'lead' => $log->lead ? [
                'id' => $log->lead->id,
                'name' => $log->lead->name,
                'email' => $log->lead->email,
            ] : null,
            'user' => $log->user ? [
                'id' => $log->user->id,
                'name' => $log->user->name,
                'email' => $log->user->email,
            ] : null,
            'created_at' => $log->created_at?->toIso8601String(),
        ])->all();
    }

    public function emailStats(User $user, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $role = (string) $context['role'];

        return $this->cacheService->rememberForCompany(
            companyId: $resolvedCompanyId,
            scope: 'dashboard.email_activity',
            variant: $role . '|' . $user->id,
            ttlSeconds: 120,
            resolver: function () use ($resolvedCompanyId, $role, $user): array {
                $messageQuery = CrmEmailMessage::query()->where('company_id', $resolvedCompanyId);
                $threadQuery = CrmEmailThread::query()->where('company_id', $resolvedCompanyId);

                if ($role === 'agent') {
                    $messageQuery->whereHas('lead', function ($leadQuery) use ($user): void {
                        $leadQuery->where('created_by_user_id', $user->id)
                            ->orWhere('assigned_to_user_id', $user->id);
                    });
                    $threadQuery->whereHas('lead', function ($leadQuery) use ($user): void {
                        $leadQuery->where('created_by_user_id', $user->id)
                            ->orWhere('assigned_to_user_id', $user->id);
                    });
                }

                $today = now()->startOfDay();

                return [
                    'emails_sent_today' => (clone $messageQuery)
                        ->where('direction', CrmEmailDirection::Sent)
                        ->where('status', CrmEmailStatus::Sent)
                        ->where('sent_at', '>=', $today)
                        ->count(),
                    'unread_crm_emails' => (clone $messageQuery)
                        ->where('is_read', false)
                        ->where('direction', CrmEmailDirection::Received)
                        ->count(),
                    'failed_deliveries' => (clone $messageQuery)
                        ->where('status', CrmEmailStatus::Failed)
                        ->where('created_at', '>=', now()->subDays(7))
                        ->count(),
                    'pending_follow_ups' => (clone $threadQuery)
                        ->where('last_message_at', '<=', now()->subDays(3))
                        ->count(),
                ];
            },
        );
    }

    // ─── Private helpers ────────────────────────────────────────────────

    /**
     * Upsert a single email message from any provider into the CRM.
     */
    private function upsertEmailMessage(
        EmailProviderInterface $provider,
        EmailAccountDTO $accountDTO,
        EmailAccount $emailAccount,
        int $companyId,
        string $providerMessageId,
        ?int $forcedLeadId = null,
    ): void {
        $existing = CrmEmailMessage::withTrashed()
            ->where('company_id', $companyId)
            ->where('gmail_message_id', $providerMessageId)
            ->first();

        // Intentionally deleted in CRM — never re-import.
        if ($existing !== null) {
            return;
        }

        $raw = $provider->getMessage($accountDTO, $providerMessageId);
        $parsed = $provider->parseMessage($raw);

        // Skip trashed/spam messages (label-based filtering is provider-specific;
        // we check the raw payload for known trash/spam indicators).
        $labelIds = is_array($raw['labelIds'] ?? null) ? $raw['labelIds'] : [];
        if (in_array('TRASH', $labelIds, true) || in_array('SPAM', $labelIds, true)) {
            return;
        }

        $leadId = $forcedLeadId ?? $this->resolveLeadIdFromParticipants($companyId, $parsed);
        $accountEmail = strtolower($emailAccount->email);
        $fromEmail = strtolower((string) ($parsed->fromEmail ?? ''));
        $direction = $fromEmail === $accountEmail
            ? CrmEmailDirection::Sent
            : CrmEmailDirection::Received;

        $thread = CrmEmailThread::query()->firstOrCreate(
            [
                'company_id' => $companyId,
                'gmail_thread_id' => $parsed->threadId,
            ],
            [
                'lead_id' => $leadId,
                'subject' => $parsed->subject,
                'snippet' => $parsed->snippet,
                'last_message_at' => $parsed->sentAt ? Carbon::parse($parsed->sentAt) : now(),
                'unread_count' => $parsed->isRead ? 0 : 1,
                'message_count' => 0,
                'participant_emails' => $this->extractParticipantEmails($parsed),
            ],
        );

        if ($leadId !== null && $thread->lead_id === null) {
            $thread->update(['lead_id' => $leadId]);
        }

        $message = CrmEmailMessage::query()->create([
            'company_id' => $companyId,
            'thread_id' => $thread->id,
            'lead_id' => $leadId ?? $thread->lead_id,
            'gmail_message_id' => $parsed->messageId,
            'gmail_thread_id' => $parsed->threadId,
            'direction' => $direction,
            'status' => CrmEmailStatus::Delivered,
            'from_name' => $parsed->fromName,
            'from_email' => $parsed->fromEmail,
            'to_recipients' => $parsed->toRecipients,
            'cc_recipients' => $parsed->ccRecipients,
            'bcc_recipients' => $parsed->bccRecipients,
            'subject' => $parsed->subject,
            'body_html' => $parsed->bodyHtml,
            'body_text' => $parsed->bodyText,
            'is_read' => $parsed->isRead,
            'is_starred' => $parsed->isStarred,
            'gmail_account_email' => $emailAccount->email,
            'sent_at' => $direction === CrmEmailDirection::Sent && $parsed->sentAt ? Carbon::parse($parsed->sentAt) : null,
            'received_at' => $direction === CrmEmailDirection::Received && $parsed->sentAt ? Carbon::parse($parsed->sentAt) : null,
        ]);

        foreach ($parsed->attachments as $attachmentMeta) {
            try {
                $attachment = CrmEmailAttachment::query()->create([
                    'company_id' => $companyId,
                    'message_id' => $message->id,
                    'gmail_attachment_id' => $attachmentMeta['attachment_id'],
                    'gmail_message_id' => $parsed->messageId,
                    'filename' => $attachmentMeta['filename'],
                    'mime_type' => $attachmentMeta['mime_type'],
                    'size_bytes' => $attachmentMeta['size'],
                    'sync_status' => 'pending',
                ]);

                ProcessEmailAttachmentJob::dispatch((int) $attachment->id);
            } catch (\Throwable $exception) {
                Log::warning('CRM email attachment metadata could not be stored.', [
                    'company_id' => $companyId,
                    'message_id' => $message->id,
                    'provider_message_id' => $parsed->messageId,
                    'error' => $exception->getMessage(),
                ]);
            }
        }

        $thread->update([
            'subject' => $parsed->subject ?? $thread->subject,
            'snippet' => $parsed->snippet ?? $thread->snippet,
            'last_message_at' => $parsed->sentAt ? Carbon::parse($parsed->sentAt) : $thread->last_message_at,
            'message_count' => $thread->messages()->count(),
            'unread_count' => $thread->messages()->where('is_read', false)->count(),
        ]);

        $syncAction = $direction === CrmEmailDirection::Sent ? 'sync_sent' : 'sync_received';

        $this->logActivity($companyId, null, $syncAction, [
            'message_id' => $message->id,
            'provider_message_id' => $parsed->messageId,
            'provider_thread_id' => $parsed->threadId,
            'subject' => $parsed->subject,
            'from_email' => $parsed->fromEmail,
            'direction' => $direction->value,
            'email_account_id' => $emailAccount->id,
            'provider' => $emailAccount->provider,
        ], $message->id, $thread->id, $leadId);
    }

    /**
     * Resolve a lead ID from the participants of a parsed email.
     */
    private function resolveLeadIdFromParticipants(int $companyId, ParsedEmailDTO $parsed): ?int
    {
        $emails = $this->extractParticipantEmails($parsed);

        if ($emails === []) {
            return null;
        }

        $lead = Lead::query()
            ->where('company_id', $companyId)
            ->whereNotNull('email')
            ->whereIn(DB::raw('LOWER(email)'), $emails)
            ->first();

        return $lead ? (int) $lead->id : null;
    }

    /**
     * Extract all participant email addresses from a parsed email.
     *
     * @return list<string>
     */
    private function extractParticipantEmails(ParsedEmailDTO $parsed): array
    {
        $emails = [];

        if ($parsed->fromEmail !== null && $parsed->fromEmail !== '') {
            $emails[] = strtolower($parsed->fromEmail);
        }

        foreach ([$parsed->toRecipients, $parsed->ccRecipients, $parsed->bccRecipients] as $group) {
            foreach ($group as $recipient) {
                if (! empty($recipient['email'])) {
                    $emails[] = strtolower((string) $recipient['email']);
                }
            }
        }

        return array_values(array_unique($emails));
    }

    /**
     * @param  list<array{email:string,name?:string}>  $to
     * @param  list<array{email:string,name?:string}>  $cc
     * @param  list<array{email:string,name?:string}>  $bcc
     * @return list<string>
     */
    private function collectParticipantEmails(array $to, array $cc, array $bcc, ?string $leadEmail): array
    {
        $emails = [];

        foreach ([$to, $cc, $bcc] as $group) {
            foreach ($group as $recipient) {
                $emails[] = strtolower($recipient['email']);
            }
        }

        if ($leadEmail) {
            $emails[] = strtolower(trim($leadEmail));
        }

        return array_values(array_unique(array_filter($emails)));
    }

    /**
     * @param  list<mixed>  $recipients
     * @return list<array{email:string,name:?string}>
     */
    private function normalizeRecipients(array $recipients): array
    {
        $normalized = [];

        foreach ($recipients as $recipient) {
            if (! is_array($recipient)) {
                continue;
            }

            $email = strtolower(trim((string) ($recipient['email'] ?? '')));

            if ($email === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                continue;
            }

            $normalized[] = [
                'email' => $email,
                'name' => isset($recipient['name']) ? trim((string) $recipient['name']) : null,
            ];
        }

        return $normalized;
    }

    private function attachPendingUploads(CrmEmailMessage $message, int $companyId, array $attachmentIds): void
    {
        if ($attachmentIds === []) {
            return;
        }

        CrmEmailAttachment::query()
            ->where('company_id', $companyId)
            ->whereNull('message_id')
            ->whereIn('id', $attachmentIds)
            ->update(['message_id' => $message->id]);
    }

    /**
     * Resolve which email account to send from.
     *
     * Priority:
     *   1. Explicit email_account_id in the request data.
     *   2. User's default email account.
     *   3. First active account (fallback).
     */
    private function resolveSendingAccount(User $user, int $companyId, array $data): EmailAccount
    {
        $explicitId = isset($data['email_account_id']) ? (int) $data['email_account_id'] : null;

        if ($explicitId !== null && $explicitId > 0) {
            $account = EmailAccount::query()
                ->where('company_id', $companyId)
                ->where('user_id', $user->id)
                ->where('status', 'active')
                ->find($explicitId);

            if ($account !== null) {
                return $account;
            }
        }

        $default = $this->emailAccountService->getDefaultAccount($user, $companyId);

        if ($default !== null) {
            return $default;
        }

        throw ValidationException::withMessages([
            'email_account_id' => ['No active email account is connected. Connect an email account to send CRM emails.'],
        ]);
    }

    /**
     * Require an active email account for the given user.
     */
    private function requireUserEmailAccount(int $companyId, int $userId, ?string $preferredEmail = null): EmailAccount
    {
        $query = EmailAccount::query()
            ->where('company_id', $companyId)
            ->where('user_id', $userId)
            ->where('status', 'active');

        if ($preferredEmail !== null && $preferredEmail !== '') {
            $matched = (clone $query)->whereRaw('LOWER(email) = ?', [strtolower($preferredEmail)])->first();
            if ($matched !== null) {
                return $matched;
            }
        }

        $account = $query->orderByDesc('is_default')->orderBy('created_at')->first();

        if ($account === null) {
            throw ValidationException::withMessages([
                'integration' => ['No active email account is connected. Connect an email account to send and receive CRM emails.'],
            ]);
        }

        return $account;
    }

    /**
     * Resolve the email account that owns a given CRM message.
     */
    private function resolveEmailAccountForMessage(
        int $companyId,
        int $userId,
        CrmEmailMessage $message,
    ): EmailAccount {
        $accountEmail = strtolower(trim((string) ($message->gmail_account_email ?? '')));

        // Try matching by the stored account email
        if ($accountEmail !== '') {
            $matched = EmailAccount::query()
                ->where('company_id', $companyId)
                ->where('status', 'active')
                ->whereRaw('LOWER(email) = ?', [$accountEmail])
                ->first();

            if ($matched !== null) {
                return $matched;
            }
        }

        // Fall back to the user's default account
        $userAccount = EmailAccount::query()
            ->where('company_id', $companyId)
            ->where('user_id', $userId)
            ->where('status', 'active')
            ->orderByDesc('is_default')
            ->first();

        if ($userAccount !== null) {
            return $userAccount;
        }

        throw ValidationException::withMessages([
            'integration' => ['No active email account is connected. Connect an email account to manage CRM emails.'],
        ]);
    }

    /**
     * Require a company-level email account (for company-wide sync).
     */
    private function requireCompanyEmailAccount(int $companyId): EmailAccount
    {
        $account = EmailAccount::query()
            ->where('company_id', $companyId)
            ->where('status', 'active')
            ->orderByDesc('is_default')
            ->orderBy('created_at')
            ->first();

        if ($account === null) {
            throw ValidationException::withMessages([
                'integration' => ['No active company email account is connected for CRM history sync.'],
            ]);
        }

        return $account;
    }

    /**
     * Sync history for a given email account using the provider's history/delta API.
     */
    private function syncAccountHistory(EmailAccount $emailAccount, int $companyId): void
    {
        $provider = $this->emailAccountService->resolveProvider($emailAccount);
        $accountDTO = $emailAccount->toDTO();

        Log::info('CRM email account history sync started.', [
            'company_id' => $companyId,
            'email_account_id' => $emailAccount->id,
            'provider' => $emailAccount->provider,
            'email' => $emailAccount->email,
            'history_id' => $emailAccount->history_id,
        ]);

        try {
            if ($emailAccount->history_id === null) {
                $this->runInitialMailboxBackfill($provider, $accountDTO, $emailAccount, $companyId);
            } else {
                try {
                    $history = $provider->listHistory($accountDTO, (string) $emailAccount->history_id);
                } catch (StaleGmailHistoryException $exception) {
                    Log::warning('CRM email history cursor stale; resetting mailbox sync.', [
                        'company_id' => $companyId,
                        'email_account_id' => $emailAccount->id,
                        'provider' => $emailAccount->provider,
                        'history_id' => $emailAccount->history_id,
                        'error' => $exception->getMessage(),
                    ]);

                    $emailAccount->update(['history_id' => null]);
                    $emailAccount->refresh();
                    $this->runInitialMailboxBackfill($provider, $accountDTO, $emailAccount, $companyId);

                    return;
                }

                $messageIds = [];

                foreach ($history['history'] as $entry) {
                    if (! is_array($entry)) {
                        continue;
                    }

                    foreach (['messagesAdded', 'messages'] as $key) {
                        $items = is_array($entry[$key] ?? null) ? $entry[$key] : [];

                        foreach ($items as $item) {
                            $message = is_array($item['message'] ?? null) ? $item['message'] : $item;
                            if (! is_array($message)) {
                                continue;
                            }
                            $id = (string) ($message['id'] ?? '');

                            if ($id !== '') {
                                $messageIds[] = $id;
                            }
                        }
                    }
                }

                // Providers without incremental history (Zoho/IMAP) return empty history —
                // fall back to a recent listMessages backfill.
                if ($messageIds === [] && in_array($emailAccount->provider, ['zoho', 'imap_smtp'], true)) {
                    $this->runInitialMailboxBackfill($provider, $accountDTO, $emailAccount, $companyId);

                    return;
                }

                $messageIds = array_values(array_unique($messageIds));

                foreach ($messageIds as $providerMessageId) {
                    try {
                        $this->upsertEmailMessage($provider, $accountDTO, $emailAccount, $companyId, $providerMessageId);
                    } catch (\Throwable $exception) {
                        if ($this->isMissingProviderMessageError($exception)) {
                            Log::info('CRM email sync skipped missing provider message.', [
                                'company_id' => $companyId,
                                'email_account_id' => $emailAccount->id,
                                'provider_message_id' => $providerMessageId,
                            ]);

                            continue;
                        }

                        throw $exception;
                    }
                }

                $this->emailAccountService->updateSyncState(
                    $emailAccount,
                    $history['historyId'] ?? $emailAccount->history_id,
                );

                Log::info('CRM email account history sync completed.', [
                    'company_id' => $companyId,
                    'email_account_id' => $emailAccount->id,
                    'provider' => $emailAccount->provider,
                    'messages_synced' => count($messageIds),
                ]);
            }
        } catch (\Throwable $exception) {
            Log::error('CRM email account history sync failed.', [
                'company_id' => $companyId,
                'email_account_id' => $emailAccount->id,
                'provider' => $emailAccount->provider,
                'error' => $exception->getMessage(),
            ]);

            if ($this->shouldMarkAccountConnectionError($exception)) {
                $this->emailAccountService->markError($emailAccount, $exception->getMessage());
            }

            throw $exception;
        }

        $this->cacheService->bumpCompanyVersion($companyId);
    }

    /**
     * First-sync / fallback: import recent mailbox messages then seed a cursor.
     */
    private function runInitialMailboxBackfill(
        EmailProviderInterface $provider,
        EmailAccountDTO $accountDTO,
        EmailAccount $emailAccount,
        int $companyId,
    ): void {
        $synced = 0;
        $pageToken = null;
        $pages = 0;

        do {
            $listing = $provider->listMessages($accountDTO, '', $pageToken, 50);
            $messages = is_array($listing['messages'] ?? null) ? $listing['messages'] : [];

            foreach ($messages as $item) {
                if (! is_array($item)) {
                    continue;
                }
                $providerMessageId = (string) ($item['id'] ?? '');
                if ($providerMessageId === '') {
                    continue;
                }

                try {
                    $this->upsertEmailMessage($provider, $accountDTO, $emailAccount, $companyId, $providerMessageId);
                    $synced++;
                } catch (\Throwable $exception) {
                    Log::warning('CRM email initial backfill message failed.', [
                        'company_id' => $companyId,
                        'email_account_id' => $emailAccount->id,
                        'provider_message_id' => $providerMessageId,
                        'error' => $exception->getMessage(),
                    ]);
                }
            }

            $pageToken = isset($listing['nextPageToken']) ? (string) $listing['nextPageToken'] : null;
            $pages++;
        } while ($pageToken !== null && $pageToken !== '' && $pages < 3);

        $historyId = null;
        try {
            $profile = $provider->getProfile($accountDTO);
            if (isset($profile['historyId']) && (string) $profile['historyId'] !== '') {
                $historyId = (string) $profile['historyId'];
            }
        } catch (\Throwable) {
            // Profile optional for cursor seeding.
        }

        if ($historyId === null) {
            $historyId = (string) time();
        }

        $this->emailAccountService->updateSyncState($emailAccount, $historyId);

        Log::info('CRM email account initial backfill completed.', [
            'company_id' => $companyId,
            'email_account_id' => $emailAccount->id,
            'provider' => $emailAccount->provider,
            'messages_synced' => $synced,
        ]);
    }

    private function buildLeadSyncQuery(string $provider, string $email): string
    {
        return match ($provider) {
            'google' => sprintf('(from:%s OR to:%s)', $email, $email),
            'microsoft' => 'participants:' . $email,
            'zoho' => 'participants:' . $email,
            'imap_smtp' => 'participants:' . $email,
            default => $email,
        };
    }

    /**
     * @return array{company:\App\Models\Company,role:string}
     */
    private function authorizeLeadAccess(User $user, Lead $lead, mixed $companyId): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $role = (string) $context['role'];

        if ($lead->company_id !== $resolvedCompanyId) {
            throw ValidationException::withMessages([
                'lead' => ['The selected lead is outside your company context.'],
            ]);
        }

        if ($role === 'agent') {
            if ((int) $lead->created_by_user_id !== (int) $user->id && (int) ($lead->assigned_to_user_id ?? 0) !== (int) $user->id) {
                throw ValidationException::withMessages([
                    'authorization' => ['Agents can only access emails for leads they created or are assigned to.'],
                ]);
            }
        }

        return $context;
    }

    private function assertThreadBelongsToLead(CrmEmailThread $thread, int $companyId, int $leadId): void
    {
        if ($thread->company_id !== $companyId || (int) $thread->lead_id !== $leadId) {
            throw ValidationException::withMessages([
                'thread' => ['Email thread is not available for this lead.'],
            ]);
        }
    }

    private function assertMessageBelongsToLead(CrmEmailMessage $message, int $companyId, int $leadId): void
    {
        if ($message->company_id !== $companyId || (int) $message->lead_id !== $leadId) {
            throw ValidationException::withMessages([
                'message' => ['Email message is not available for this lead.'],
            ]);
        }
    }

    /**
     * @param  array<string,mixed>  $metadata
     */
    private function logActivity(
        int $companyId,
        ?int $userId,
        string $action,
        array $metadata,
        ?int $messageId = null,
        ?int $threadId = null,
        ?int $leadId = null,
    ): void {
        CrmEmailActivityLog::query()->create([
            'company_id' => $companyId,
            'user_id' => $userId,
            'message_id' => $messageId,
            'thread_id' => $threadId,
            'lead_id' => $leadId,
            'action' => $action,
            'metadata' => $metadata,
        ]);
    }

    private function invalidateLeadCache(int $companyId, int $leadId): void
    {
        Cache::forget(sprintf('crm:emails:lead:%d:%d', $companyId, $leadId));
    }

    /**
     * @param  \Illuminate\Database\Eloquent\Builder<\App\Models\CrmEmailMessage>  $query
     * @return \Illuminate\Database\Eloquent\Builder<\App\Models\CrmEmailMessage>
     */
    private function applyMessageTimelineOrder($query)
    {
        return $query->orderByRaw('COALESCE(sent_at, received_at) ASC');
    }

    private function shouldMarkAccountConnectionError(\Throwable $exception): bool
    {
        $message = strtolower($this->exceptionMessage($exception));

        if ($message === '') {
            return false;
        }

        if (
            str_contains($message, 'requested entity was not found')
            || str_contains($message, 'rate limit')
            || str_contains($message, 'message not found')
            || str_contains($message, 'history cursor is stale')
        ) {
            return false;
        }

        return str_contains($message, 'authorization failed')
            || str_contains($message, 'invalid_grant')
            || str_contains($message, 'token refresh failed')
            || str_contains($message, 'reconnect')
            || str_contains($message, 'access expired')
            || str_contains($message, 'invalid_client');
    }

    private function isMissingProviderMessageError(\Throwable $exception): bool
    {
        $message = strtolower($this->exceptionMessage($exception));

        return str_contains($message, 'message not found')
            || str_contains($message, 'requested entity was not found');
    }

    private function exceptionMessage(\Throwable $exception): string
    {
        if ($exception instanceof ValidationException) {
            $first = collect($exception->errors())->flatten()->first();

            if (is_string($first) && trim($first) !== '') {
                return trim($first);
            }
        }

        return trim($exception->getMessage());
    }
}
