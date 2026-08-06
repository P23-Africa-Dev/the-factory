<?php

declare(strict_types=1);

namespace App\Services\Email\Providers;

use App\Models\EmailAccount;
use App\Services\Email\EmailAccountDTO;
use App\Services\Email\EmailMessageDTO;
use App\Services\Email\EmailProviderInterface;
use App\Services\Email\ParsedEmailDTO;
use App\Services\Google\EmailAccountGmailConnection;
use App\Services\Google\GmailApiService;
use App\Services\Google\GmailMessageParser;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * Google / Gmail provider implementation.
 *
 * Wraps the existing GmailApiService and GmailMessageParser to conform
 * to the EmailProviderInterface.
 */
class GoogleProvider implements EmailProviderInterface
{
    public function __construct(
        private readonly GmailApiService $gmailApiService,
        private readonly GmailMessageParser $gmailMessageParser,
    ) {}

    public function send(EmailAccountDTO $account, EmailMessageDTO $message): array
    {
        $this->assertProvider($account, 'google');
        $this->assertActive($account);

        $result = $this->gmailApiService->sendMessage(
            connection: $this->toConnection($account),
            to: $message->to,
            cc: $message->cc,
            bcc: $message->bcc,
            subject: $message->subject,
            bodyHtml: (string) $message->bodyHtml,
            bodyText: (string) $message->bodyText,
            attachments: $message->attachments,
            threadId: $message->threadId,
            extraHeaders: $message->extraHeaders,
        );

        return [
            'id' => $result['id'],
            'threadId' => $result['threadId'],
        ];
    }

    public function listMessages(EmailAccountDTO $account, string $query, ?string $pageToken = null, int $maxResults = 25): array
    {
        $this->assertProvider($account, 'google');
        $this->assertActive($account);

        return $this->gmailApiService->listMessagesForQuery(
            connection: $this->toConnection($account),
            query: $query,
            pageToken: $pageToken,
            maxResults: $maxResults,
        );
    }

    public function getMessage(EmailAccountDTO $account, string $messageId): array
    {
        $this->assertProvider($account, 'google');
        $this->assertActive($account);

        return $this->gmailApiService->getMessage(
            connection: $this->toConnection($account),
            messageId: $messageId,
        );
    }

    public function getThread(EmailAccountDTO $account, string $threadId): array
    {
        $this->assertProvider($account, 'google');
        $this->assertActive($account);

        return $this->gmailApiService->getThread(
            connection: $this->toConnection($account),
            threadId: $threadId,
        );
    }

    public function getAttachment(EmailAccountDTO $account, string $messageId, string $attachmentId): string
    {
        $this->assertProvider($account, 'google');
        $this->assertActive($account);

        return $this->gmailApiService->getAttachment(
            connection: $this->toConnection($account),
            messageId: $messageId,
            attachmentId: $attachmentId,
        );
    }

    public function markAsRead(EmailAccountDTO $account, string $messageId): void
    {
        $this->assertProvider($account, 'google');
        $this->assertActive($account);

        $this->gmailApiService->markAsRead(
            connection: $this->toConnection($account),
            messageId: $messageId,
        );
    }

    public function trashMessage(EmailAccountDTO $account, string $messageId): void
    {
        $this->assertProvider($account, 'google');
        $this->assertActive($account);

        $this->gmailApiService->trashMessage(
            connection: $this->toConnection($account),
            messageId: $messageId,
        );
    }

    public function listHistory(EmailAccountDTO $account, string $startHistoryId): array
    {
        $this->assertProvider($account, 'google');
        $this->assertActive($account);

        return $this->gmailApiService->listHistory(
            connection: $this->toConnection($account),
            startHistoryId: $startHistoryId,
        );
    }

    public function getProfile(EmailAccountDTO $account): array
    {
        $this->assertProvider($account, 'google');
        $this->assertActive($account);

        return $this->gmailApiService->getProfile(
            connection: $this->toConnection($account),
        );
    }

    public function testConnection(EmailAccountDTO $account): bool
    {
        $this->assertProvider($account, 'google');

        try {
            $this->gmailApiService->getProfile($this->toConnection($account));

            return true;
        } catch (\Throwable $e) {
            Log::warning('Google email connection test failed.', [
                'email' => $account->email,
                'error' => $e->getMessage(),
            ]);

            throw ValidationException::withMessages([
                'connection' => [$this->humanizeProviderTestError($e, 'Google')],
            ]);
        }
    }

    private function humanizeProviderTestError(\Throwable $e, string $provider): string
    {
        if ($e instanceof ValidationException) {
            $first = collect($e->errors())->flatten()->first();
            if (is_string($first) && trim($first) !== '') {
                return trim($first);
            }
        }

        $raw = trim($e->getMessage());
        if ($raw === '' || $raw === 'The given data was invalid.') {
            return "{$provider} connection test failed. Reconnect the account and try again.";
        }

        return "{$provider} connection test failed: {$raw}";
    }

    public function parseMessage(array $rawMessage): ParsedEmailDTO
    {
        $parsed = $this->gmailMessageParser->parse($rawMessage);

        return new ParsedEmailDTO(
            messageId: $parsed['gmail_message_id'],
            threadId: $parsed['gmail_thread_id'],
            subject: $parsed['subject'],
            fromName: $parsed['from_name'],
            fromEmail: $parsed['from_email'],
            toRecipients: $parsed['to_recipients'],
            ccRecipients: $parsed['cc_recipients'],
            bccRecipients: $parsed['bcc_recipients'],
            bodyHtml: $parsed['body_html'],
            bodyText: $parsed['body_text'],
            isRead: $parsed['is_read'],
            isStarred: $parsed['is_starred'],
            sentAt: $parsed['sent_at'],
            snippet: $parsed['snippet'],
            attachments: $parsed['attachments'],
        );
    }

    private function toConnection(EmailAccountDTO $account): EmailAccountGmailConnection
    {
        $model = EmailAccount::query()->find($account->id);

        if ($model === null) {
            throw ValidationException::withMessages([
                'account' => ['Email account not found.'],
            ]);
        }

        return new EmailAccountGmailConnection($model);
    }

    private function assertProvider(EmailAccountDTO $account, string $expected): void
    {
        if ($account->provider !== $expected) {
            throw ValidationException::withMessages([
                'provider' => ['Account is not a Google account.'],
            ]);
        }
    }

    private function assertActive(EmailAccountDTO $account): void
    {
        if ($account->status !== 'active') {
            throw ValidationException::withMessages([
                'account' => ['Email account is not active. Please reconnect.'],
            ]);
        }
    }
}
