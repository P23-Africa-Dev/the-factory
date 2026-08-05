<?php

declare(strict_types=1);

namespace App\Services\Email;

/**
 * Unified Email Provider Interface.
 *
 * Factory23 communicates only with this interface — never directly with
 * a specific provider. Providers are interchangeable.
 *
 * Implementations:
 *   - GoogleProvider      (Gmail / Google Workspace via OAuth 2.0)
 *   - MicrosoftProvider   (Microsoft 365 / Outlook via OAuth)
 *   - ZohoProvider        (Zoho Mail via OAuth)
 *   - ImapSmtpProvider    (Generic IMAP/SMTP for any business email)
 */
interface EmailProviderInterface
{
    /**
     * Send an email message.
     *
     * @param  EmailAccountDTO  $account  The connected email account to send from.
     * @param  EmailMessageDTO  $message  The message payload.
     * @return array{id:string,threadId:?string}  Provider-specific identifiers.
     */
    public function send(EmailAccountDTO $account, EmailMessageDTO $message): array;

    /**
     * List messages matching a search query.
     *
     * @param  EmailAccountDTO  $account
     * @param  string           $query     Provider-specific search query.
     * @param  string|null      $pageToken Pagination token.
     * @param  int              $maxResults
     * @return array{messages:array<int,array<string,mixed>>,nextPageToken:?string}
     */
    public function listMessages(EmailAccountDTO $account, string $query, ?string $pageToken = null, int $maxResults = 25): array;

    /**
     * Fetch a single message by its provider ID.
     *
     * @param  EmailAccountDTO  $account
     * @param  string           $messageId
     * @return array<string,mixed>  Raw provider message payload.
     */
    public function getMessage(EmailAccountDTO $account, string $messageId): array;

    /**
     * Fetch a thread by its provider ID.
     *
     * @param  EmailAccountDTO  $account
     * @param  string           $threadId
     * @return array<string,mixed>
     */
    public function getThread(EmailAccountDTO $account, string $threadId): array;

    /**
     * Download an attachment binary.
     *
     * @param  EmailAccountDTO  $account
     * @param  string           $messageId
     * @param  string           $attachmentId
     * @return string  Raw binary content.
     */
    public function getAttachment(EmailAccountDTO $account, string $messageId, string $attachmentId): string;

    /**
     * Mark a message as read.
     *
     * @param  EmailAccountDTO  $account
     * @param  string           $messageId
     */
    public function markAsRead(EmailAccountDTO $account, string $messageId): void;

    /**
     * Move a message to trash.
     *
     * @param  EmailAccountDTO  $account
     * @param  string           $messageId
     */
    public function trashMessage(EmailAccountDTO $account, string $messageId): void;

    /**
     * List history changes since a given history ID (incremental sync).
     *
     * @param  EmailAccountDTO  $account
     * @param  string           $startHistoryId
     * @return array{history:array<int,array<string,mixed>>,historyId:?string}
     */
    public function listHistory(EmailAccountDTO $account, string $startHistoryId): array;

    /**
     * Get the provider's profile for the connected account.
     *
     * @param  EmailAccountDTO  $account
     * @return array<string,mixed>
     */
    public function getProfile(EmailAccountDTO $account): array;

    /**
     * Test the connection to verify credentials are valid.
     *
     * @param  EmailAccountDTO  $account
     * @return bool
     */
    public function testConnection(EmailAccountDTO $account): bool;

    /**
     * Parse a raw provider message into a normalized structure.
     *
     * @param  array<string,mixed>  $rawMessage
     * @return ParsedEmailDTO
     */
    public function parseMessage(array $rawMessage): ParsedEmailDTO;
}