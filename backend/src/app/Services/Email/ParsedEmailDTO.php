<?php

declare(strict_types=1);

namespace App\Services\Email;

/**
 * Normalized, provider-agnostic representation of a parsed email message.
 */
final class ParsedEmailDTO
{
    /**
     * @param  string                                              $messageId        Provider-specific message ID.
     * @param  string                                              $threadId         Provider-specific thread ID.
     * @param  string|null                                         $subject
     * @param  string|null                                         $fromName
     * @param  string|null                                         $fromEmail
     * @param  list<array{email:string,name?:string}>              $toRecipients
     * @param  list<array{email:string,name?:string}>              $ccRecipients
     * @param  list<array{email:string,name?:string}>              $bccRecipients
     * @param  string|null                                         $bodyHtml
     * @param  string|null                                         $bodyText
     * @param  bool                                                $isRead
     * @param  bool                                                $isStarred
     * @param  string|null                                         $sentAt           ISO 8601 timestamp.
     * @param  string|null                                         $snippet
     * @param  list<array{attachment_id:string,filename:string,mime_type:string,size:int}>  $attachments
     */
    public function __construct(
        public readonly string $messageId,
        public readonly string $threadId,
        public readonly ?string $subject = null,
        public readonly ?string $fromName = null,
        public readonly ?string $fromEmail = null,
        public readonly array $toRecipients = [],
        public readonly array $ccRecipients = [],
        public readonly array $bccRecipients = [],
        public readonly ?string $bodyHtml = null,
        public readonly ?string $bodyText = null,
        public readonly bool $isRead = false,
        public readonly bool $isStarred = false,
        public readonly ?string $sentAt = null,
        public readonly ?string $snippet = null,
        public readonly array $attachments = [],
    ) {}
}
