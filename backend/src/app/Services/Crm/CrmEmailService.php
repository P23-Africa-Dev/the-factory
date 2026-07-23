<?php

declare(strict_types=1);

namespace App\Services\Crm;

use App\Enums\CrmEmailDirection;
use App\Enums\CrmEmailStatus;
use App\Jobs\ProcessEmailAttachmentJob;
use App\Jobs\SendCrmEmailJob;
use App\Jobs\SyncLeadEmailsJob;
use App\Models\CompanyCalendarConnection;
use App\Models\CrmEmailActivityLog;
use App\Models\CrmEmailAttachment;
use App\Models\CrmEmailMessage;
use App\Models\CrmEmailThread;
use App\Models\Lead;
use App\Models\UserCalendarConnection;
use App\Models\User;
use App\Services\Analytics\AggregateCacheService;
use App\Services\Company\CompanyContextService;
use App\Services\Google\GmailApiService;
use App\Services\Google\GmailMessageParser;
use App\Services\Google\GoogleScopeHelper;
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
        private readonly GmailApiService $gmailApiService,
        private readonly GmailMessageParser $gmailMessageParser,
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
     * @param  array<string,mixed>  $data
     */
    public function queueSend(User $user, Lead $lead, array $data): CrmEmailMessage
    {
        $context = $this->authorizeLeadAccess($user, $lead, $data['company_id'] ?? null);
        $companyId = (int) $context['company']->id;
        $connection = $this->requireUserGmailConnection($companyId, (int) $user->id);

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
        $gmailThreadId = isset($data['gmail_thread_id']) ? trim((string) $data['gmail_thread_id']) : null;

        if ($gmailThreadId !== null && $gmailThreadId !== '') {
            $thread = CrmEmailThread::query()
                ->where('company_id', $companyId)
                ->where('lead_id', $lead->id)
                ->where('gmail_thread_id', $gmailThreadId)
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
            'from_name' => $connection->organizer_name,
            'from_email' => $connection->organizer_email,
            'to_recipients' => $to,
            'cc_recipients' => $cc,
            'bcc_recipients' => $bcc,
            'subject' => $subject,
            'body_html' => $bodyHtml,
            'body_text' => $bodyText,
            'is_read' => true,
            'sent_by_user_id' => $user->id,
            'gmail_account_email' => $connection->organizer_email,
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
            'gmail_account_email' => $connection->organizer_email,
        ], $message->id, $thread->id, (int) $lead->id);

        SendCrmEmailJob::dispatch(
            (int) $message->id,
            isset($data['reply_to_gmail_message_id']) ? trim((string) $data['reply_to_gmail_message_id']) : null,
        );

        $this->invalidateLeadCache($companyId, (int) $lead->id);
        $this->cacheService->bumpCompanyVersion($companyId);

        return $message->load(['attachments', 'sentBy:id,name,email', 'thread']);
    }

    public function sendMessageById(int $messageId, ?string $inReplyToGmailMessageId = null): void
    {
        $message = CrmEmailMessage::query()->with(['thread', 'attachments'])->findOrFail($messageId);
        $connection = $this->requireUserGmailConnection((int) $message->company_id, (int) $message->sent_by_user_id);

        $extraHeaders = [];
        $replyToGmailMessageId = trim((string) ($inReplyToGmailMessageId ?? ''));

        if ($replyToGmailMessageId !== '') {
            $extraHeaders[] = 'In-Reply-To: <' . $replyToGmailMessageId . '>';
            $extraHeaders[] = 'References: <' . $replyToGmailMessageId . '>';
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

            $result = $this->gmailApiService->sendMessage(
                connection: $connection,
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

            $this->logActivity((int) $message->company_id, (int) $message->sent_by_user_id, 'send', [
                'message_id' => $message->id,
                'gmail_message_id' => $result['id'],
                'gmail_thread_id' => $result['threadId'],
                'subject' => $message->subject,
                'status' => 'sent',
                'gmail_account_email' => $connection->organizer_email,
            ], $message->id, (int) $message->thread_id, (int) $message->lead_id);
        } catch (\Throwable $exception) {
            $message->update([
                'status' => CrmEmailStatus::Failed,
                'error_message' => $exception->getMessage(),
            ]);

            $this->logActivity((int) $message->company_id, (int) $message->sent_by_user_id, 'fail', [
                'message_id' => $message->id,
                'subject' => $message->subject,
                'status' => 'failed',
                'error' => $exception->getMessage(),
            ], $message->id, (int) $message->thread_id, (int) $message->lead_id);

            throw $exception;
        } finally {
            $this->invalidateLeadCache((int) $message->company_id, (int) $message->lead_id);
            $this->cacheService->bumpCompanyVersion((int) $message->company_id);
        }
    }

    public function syncLead(int $companyId, int $leadId, ?int $userId = null): void
    {
        if ($userId === null || $userId <= 0) {
            throw ValidationException::withMessages([
                'integration' => ['A connected personal Google account is required to sync lead emails.'],
            ]);
        }

        $lead = Lead::query()->where('company_id', $companyId)->findOrFail($leadId);
        $email = strtolower(trim((string) ($lead->email ?? '')));

        if ($email === '') {
            return;
        }

        $connection = $this->requireUserGmailConnection($companyId, $userId);
        $query = sprintf('(from:%s OR to:%s) -in:trash -in:spam', $email, $email);
        $pageToken = null;

        do {
            $listing = $this->gmailApiService->listMessagesForQuery($connection, $query, $pageToken, 50);
            $messages = $listing['messages'];

            foreach ($messages as $item) {
                $gmailMessageId = (string) ($item['id'] ?? '');

                if ($gmailMessageId === '') {
                    continue;
                }

                $this->upsertGmailMessage($connection, $companyId, $gmailMessageId, (int) $lead->id);
            }

            $pageToken = $listing['nextPageToken'];
        } while ($pageToken !== null && $pageToken !== '');

        $this->invalidateLeadCache($companyId, $leadId);
    }

    public function syncCompany(int $companyId): void
    {
        $this->syncConnectionHistory($this->requireCompanyGmailConnection($companyId), $companyId);
    }

    public function syncUser(int $companyId, int $userId): void
    {
        $this->syncConnectionHistory($this->requireUserGmailConnection($companyId, $userId), $companyId);
    }

    public function markAsRead(User $user, Lead $lead, CrmEmailMessage $message, ?int $companyId = null): CrmEmailMessage
    {
        $context = $this->authorizeLeadAccess($user, $lead, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $this->assertMessageBelongsToLead($message, $resolvedCompanyId, (int) $lead->id);

        if (! $message->is_read && ! str_starts_with((string) $message->gmail_message_id, 'pending-')) {
            $connection = $this->requireUserGmailConnection($resolvedCompanyId, (int) $user->id);
            $this->gmailApiService->markAsRead($connection, (string) $message->gmail_message_id);
        }

        $message->update(['is_read' => true]);
        $message->thread?->decrement('unread_count');

        return $message->fresh();
    }

    public function deleteMessage(User $user, Lead $lead, CrmEmailMessage $message, ?int $companyId = null): void
    {
        $context = $this->authorizeLeadAccess($user, $lead, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $this->assertMessageBelongsToLead($message, $resolvedCompanyId, (int) $lead->id);

        $threadId = (int) $message->thread_id;
        $gmailMessageId = (string) $message->gmail_message_id;

        if ($gmailMessageId !== '' && ! str_starts_with($gmailMessageId, 'pending-')) {
            $connection = $this->resolveGmailConnectionForMessage(
                $resolvedCompanyId,
                (int) $user->id,
                $message,
            );
            $this->gmailApiService->trashMessage($connection, $gmailMessageId);
        }

        $message->delete();

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

    public function uploadAttachment(User $user, Lead $lead, UploadedFile $file, ?int $companyId = null): CrmEmailAttachment
    {
        $context = $this->authorizeLeadAccess($user, $lead, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;

        $path = Storage::disk('local')->putFile(
            'crm-email-attachments/company-' . $resolvedCompanyId . '/lead-' . $lead->id,
            $file,
        );

        return CrmEmailAttachment::query()->create([
            'company_id' => $resolvedCompanyId,
            'uploaded_by_user_id' => $user->id,
            'filename' => $file->getClientOriginalName(),
            'mime_type' => $file->getClientMimeType() ?: 'application/octet-stream',
            'size_bytes' => (int) $file->getSize(),
            'storage_disk' => 'local',
            'storage_path' => $path,
            'sync_status' => 'uploaded',
        ]);
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

    private function upsertGmailMessage(
        CompanyCalendarConnection|UserCalendarConnection $connection,
        int $companyId,
        string $gmailMessageId,
        ?int $forcedLeadId = null,
    ): void {
        $existing = CrmEmailMessage::withTrashed()
            ->where('company_id', $companyId)
            ->where('gmail_message_id', $gmailMessageId)
            ->first();

        // Intentionally deleted in CRM — never re-import from Gmail sync.
        if ($existing !== null) {
            return;
        }

        $raw = $this->gmailApiService->getMessage($connection, $gmailMessageId);
        $parsed = $this->gmailMessageParser->parse($raw);

        $labelIds = is_array($raw['labelIds'] ?? null) ? $raw['labelIds'] : [];
        if (in_array('TRASH', $labelIds, true) || in_array('SPAM', $labelIds, true)) {
            return;
        }

        $leadId = $forcedLeadId ?? $this->resolveLeadIdFromParticipants($companyId, $parsed);
        $organizerEmail = strtolower((string) $connection->organizer_email);
        $fromEmail = strtolower((string) ($parsed['from_email'] ?? ''));
        $direction = $fromEmail === $organizerEmail
            ? CrmEmailDirection::Sent
            : CrmEmailDirection::Received;

        $thread = CrmEmailThread::query()->firstOrCreate(
            [
                'company_id' => $companyId,
                'gmail_thread_id' => $parsed['gmail_thread_id'],
            ],
            [
                'lead_id' => $leadId,
                'subject' => $parsed['subject'],
                'snippet' => $parsed['snippet'],
                'last_message_at' => $parsed['sent_at'] ? Carbon::parse($parsed['sent_at']) : now(),
                'unread_count' => $parsed['is_read'] ? 0 : 1,
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
            'gmail_message_id' => $parsed['gmail_message_id'],
            'gmail_thread_id' => $parsed['gmail_thread_id'],
            'direction' => $direction,
            'status' => CrmEmailStatus::Delivered,
            'from_name' => $parsed['from_name'],
            'from_email' => $parsed['from_email'],
            'to_recipients' => $parsed['to_recipients'],
            'cc_recipients' => $parsed['cc_recipients'],
            'bcc_recipients' => $parsed['bcc_recipients'],
            'subject' => $parsed['subject'],
            'body_html' => $parsed['body_html'],
            'body_text' => $parsed['body_text'],
            'is_read' => $parsed['is_read'],
            'is_starred' => $parsed['is_starred'],
            'gmail_account_email' => $connection->organizer_email,
            'sent_at' => $direction === CrmEmailDirection::Sent && $parsed['sent_at'] ? Carbon::parse($parsed['sent_at']) : null,
            'received_at' => $direction === CrmEmailDirection::Received && $parsed['sent_at'] ? Carbon::parse($parsed['sent_at']) : null,
        ]);

        foreach ($parsed['attachments'] as $attachmentMeta) {
            try {
                $attachment = CrmEmailAttachment::query()->create([
                    'company_id' => $companyId,
                    'message_id' => $message->id,
                    'gmail_attachment_id' => $attachmentMeta['attachment_id'],
                    'gmail_message_id' => $parsed['gmail_message_id'],
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
                    'gmail_message_id' => $parsed['gmail_message_id'],
                    'error' => $exception->getMessage(),
                ]);
            }
        }

        $thread->update([
            'subject' => $parsed['subject'] ?? $thread->subject,
            'snippet' => $parsed['snippet'] ?? $thread->snippet,
            'last_message_at' => $parsed['sent_at'] ? Carbon::parse($parsed['sent_at']) : $thread->last_message_at,
            'message_count' => $thread->messages()->count(),
            'unread_count' => $thread->messages()->where('is_read', false)->count(),
        ]);

        $this->logActivity($companyId, null, 'receive', [
            'message_id' => $message->id,
            'gmail_message_id' => $parsed['gmail_message_id'],
            'gmail_thread_id' => $parsed['gmail_thread_id'],
            'subject' => $parsed['subject'],
            'from_email' => $parsed['from_email'],
        ], $message->id, $thread->id, $leadId);
    }

    /**
     * @param  array<string,mixed>  $parsed
     */
    private function resolveLeadIdFromParticipants(int $companyId, array $parsed): ?int
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
     * @param  array<string,mixed>  $parsed
     * @return list<string>
     */
    private function extractParticipantEmails(array $parsed): array
    {
        $emails = [];

        if (! empty($parsed['from_email'])) {
            $emails[] = strtolower((string) $parsed['from_email']);
        }

        foreach (['to_recipients', 'cc_recipients', 'bcc_recipients'] as $key) {
            foreach (is_array($parsed[$key] ?? null) ? $parsed[$key] : [] as $recipient) {
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

    private function requireUserGmailConnection(int $companyId, int $userId): UserCalendarConnection
    {
        $connection = UserCalendarConnection::query()
            ->where('company_id', $companyId)
            ->where('user_id', $userId)
            ->where('status', 'active')
            ->whereNull('disconnected_at')
            ->first();

        if ($connection === null) {
            throw ValidationException::withMessages([
                'integration' => ['Google account is not connected. Connect your Google account to send and receive CRM emails.'],
            ]);
        }

        if (! GoogleScopeHelper::connectionHasGmailScopes($connection)) {
            throw ValidationException::withMessages([
                'integration' => ['Gmail permissions are missing. Reconnect your Google account to enable email.'],
            ]);
        }

        return $connection;
    }

    /**
     * Prefer the mailbox that originally synced/owned the CRM message.
     */
    private function resolveGmailConnectionForMessage(
        int $companyId,
        int $userId,
        CrmEmailMessage $message,
    ): CompanyCalendarConnection|UserCalendarConnection {
        $accountEmail = strtolower(trim((string) ($message->gmail_account_email ?? '')));

        $userConnection = UserCalendarConnection::query()
            ->where('company_id', $companyId)
            ->where('user_id', $userId)
            ->where('status', 'active')
            ->whereNull('disconnected_at')
            ->first();

        if (
            $userConnection !== null
            && GoogleScopeHelper::connectionHasGmailScopes($userConnection)
            && ($accountEmail === '' || strtolower((string) $userConnection->organizer_email) === $accountEmail)
        ) {
            return $userConnection;
        }

        if ($accountEmail !== '') {
            $matchedUserConnection = UserCalendarConnection::query()
                ->where('company_id', $companyId)
                ->where('status', 'active')
                ->whereNull('disconnected_at')
                ->whereRaw('LOWER(organizer_email) = ?', [$accountEmail])
                ->first();

            if (
                $matchedUserConnection !== null
                && GoogleScopeHelper::connectionHasGmailScopes($matchedUserConnection)
            ) {
                return $matchedUserConnection;
            }

            $companyConnection = CompanyCalendarConnection::query()
                ->where('company_id', $companyId)
                ->where('status', 'active')
                ->whereNull('disconnected_at')
                ->whereRaw('LOWER(organizer_email) = ?', [$accountEmail])
                ->first();

            if (
                $companyConnection !== null
                && GoogleScopeHelper::connectionHasGmailScopes($companyConnection)
            ) {
                return $companyConnection;
            }
        }

        if ($userConnection !== null && GoogleScopeHelper::connectionHasGmailScopes($userConnection)) {
            return $userConnection;
        }

        throw ValidationException::withMessages([
            'integration' => ['Google account is not connected. Connect your Google account to manage CRM emails.'],
        ]);
    }

    private function requireCompanyGmailConnection(int $companyId): CompanyCalendarConnection
    {
        $connection = CompanyCalendarConnection::query()
            ->where('company_id', $companyId)
            ->where('status', 'active')
            ->whereNull('disconnected_at')
            ->first();

        if ($connection === null) {
            throw ValidationException::withMessages([
                'integration' => ['No active company Google account is connected for CRM history sync.'],
            ]);
        }

        if (! GoogleScopeHelper::connectionHasGmailScopes($connection)) {
            throw ValidationException::withMessages([
                'integration' => ['Gmail permissions are missing. Reconnect your Google account to enable email.'],
            ]);
        }

        return $connection;
    }

    private function syncConnectionHistory(
        CompanyCalendarConnection|UserCalendarConnection $connection,
        int $companyId,
    ): void {
        if ($connection->gmail_history_id === null) {
            $profile = $this->gmailApiService->getProfile($connection);
            $connection->update([
                'gmail_history_id' => isset($profile['historyId']) ? (string) $profile['historyId'] : null,
                'gmail_last_synced_at' => now(),
            ]);

            return;
        }

        $history = $this->gmailApiService->listHistory($connection, (string) $connection->gmail_history_id);
        $messageIds = [];

        foreach ($history['history'] as $entry) {
            foreach (['messagesAdded', 'messages'] as $key) {
                $items = is_array($entry[$key] ?? null) ? $entry[$key] : [];

                foreach ($items as $item) {
                    $message = is_array($item['message'] ?? null) ? $item['message'] : $item;
                    $id = (string) ($message['id'] ?? '');

                    if ($id !== '') {
                        $messageIds[] = $id;
                    }
                }
            }
        }

        $messageIds = array_values(array_unique($messageIds));

        foreach ($messageIds as $gmailMessageId) {
            $this->upsertGmailMessage($connection, $companyId, $gmailMessageId);
        }

        $connection->update([
            'gmail_history_id' => $history['historyId'] ?? $connection->gmail_history_id,
            'gmail_last_synced_at' => now(),
        ]);

        $this->cacheService->bumpCompanyVersion($companyId);
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
}
