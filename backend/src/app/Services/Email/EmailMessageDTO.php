<?php

declare(strict_types=1);

namespace App\Services\Email;

/**
 * Data Transfer Object for an email message to be sent.
 */
final class EmailMessageDTO
{
    /**
     * @param  string                                              $fromEmail
     * @param  string|null                                         $fromName
     * @param  list<array{email:string,name?:string}>              $to
     * @param  list<array{email:string,name?:string}>              $cc
     * @param  list<array{email:string,name?:string}>              $bcc
     * @param  string                                              $subject
     * @param  string|null                                         $bodyHtml
     * @param  string|null                                         $bodyText
     * @param  list<array{filename:string,mime_type:string,content:string}>  $attachments
     * @param  string|null                                         $threadId
     * @param  list<string>                                        $extraHeaders
     */
    public function __construct(
        public readonly string $fromEmail,
        public readonly ?string $fromName = null,
        public readonly array $to = [],
        public readonly array $cc = [],
        public readonly array $bcc = [],
        public readonly string $subject = '',
        public readonly ?string $bodyHtml = null,
        public readonly ?string $bodyText = null,
        public readonly array $attachments = [],
        public readonly ?string $threadId = null,
        public readonly array $extraHeaders = [],
    ) {}
}
