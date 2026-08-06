<?php

declare(strict_types=1);

namespace App\Services\Email\Providers;

use App\Services\Email\EmailAccountDTO;
use App\Services\Email\EmailMessageDTO;
use App\Services\Email\EmailProviderInterface;
use App\Services\Email\ParsedEmailDTO;
use Illuminate\Mail\Message;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;

/**
 * Generic IMAP/SMTP provider for any business email.
 */
class ImapSmtpProvider implements EmailProviderInterface
{
    public function send(EmailAccountDTO $account, EmailMessageDTO $message): array
    {
        $this->assertProvider($account, 'imap_smtp');
        $this->assertActive($account);
        $this->assertSmtpConfig($account);

        $mailerName = 'imap_smtp_' . $account->id;

        config([
            'mail.mailers.' . $mailerName => [
                'transport' => 'smtp',
                'host' => $account->smtpHost,
                'port' => $account->smtpPort,
                'encryption' => $account->smtpEncryption,
                'username' => $account->smtpUsername ?? $account->email,
                'password' => $account->smtpPassword,
                'timeout' => 30,
            ],
        ]);

        try {
            $html = $message->bodyHtml ?? nl2br(e((string) ($message->bodyText ?? '')));
            $text = $message->bodyText ?? strip_tags((string) ($message->bodyHtml ?? ''));

            Mail::mailer($mailerName)->html($html, function (Message $mail) use ($account, $message, $text): void {
                $mail->from($account->email, $account->displayName ?? $account->email)
                    ->subject($message->subject);

                foreach ($message->to as $recipient) {
                    $mail->to($recipient['email'], $recipient['name'] ?? null);
                }
                foreach ($message->cc as $recipient) {
                    $mail->cc($recipient['email'], $recipient['name'] ?? null);
                }
                foreach ($message->bcc as $recipient) {
                    $mail->bcc($recipient['email'], $recipient['name'] ?? null);
                }

                $mail->text($text);

                foreach ($message->attachments as $attachment) {
                    $mail->attachData(
                        $attachment['content'],
                        $attachment['filename'],
                        ['mime' => $attachment['mime_type']],
                    );
                }

                foreach ($message->extraHeaders as $header) {
                    if (str_contains($header, ':')) {
                        [$name, $value] = array_map('trim', explode(':', $header, 2));
                        if ($name !== '') {
                            $mail->getHeaders()->addTextHeader($name, $value);
                        }
                    }
                }
            });

            return [
                'id' => 'smtp-' . uniqid('', true),
                'threadId' => $message->threadId ?? ('smtp-thread-' . uniqid('', true)),
            ];
        } catch (\Throwable $e) {
            Log::error('SMTP send failed.', [
                'email' => $account->email,
                'error' => $e->getMessage(),
            ]);

            throw ValidationException::withMessages([
                'integration' => ['SMTP send failed. Check your SMTP settings and try again.'],
            ]);
        }
    }

    public function listMessages(EmailAccountDTO $account, string $query, ?string $pageToken = null, int $maxResults = 25): array
    {
        $this->assertProvider($account, 'imap_smtp');
        $this->assertActive($account);
        $this->assertImapConfig($account);

        if (! function_exists('imap_open')) {
            throw ValidationException::withMessages([
                'integration' => ['IMAP extension is not available on this server.'],
            ]);
        }

        $mailbox = $this->openImapConnection($account, 'INBOX');

        try {
            $searchCriteria = $this->buildImapSearch($query);
            $messageNumbers = imap_search($mailbox, $searchCriteria, SE_UID);

            if ($messageNumbers === false) {
                imap_close($mailbox);

                return ['messages' => [], 'nextPageToken' => null];
            }

            rsort($messageNumbers, SORT_NUMERIC);
            $offset = $pageToken !== null ? (int) $pageToken : 0;
            $slice = array_slice($messageNumbers, $offset, $maxResults);

            $messages = [];
            foreach ($slice as $uid) {
                $messages[] = ['id' => (string) $uid, 'uid' => $uid];
            }

            $nextPageToken = ($offset + $maxResults) < count($messageNumbers)
                ? (string) ($offset + $maxResults)
                : null;

            imap_close($mailbox);

            return [
                'messages' => $messages,
                'nextPageToken' => $nextPageToken,
            ];
        } catch (\Throwable $e) {
            @imap_close($mailbox);
            Log::error('IMAP list messages failed.', [
                'email' => $account->email,
                'error' => $e->getMessage(),
            ]);

            return ['messages' => [], 'nextPageToken' => null];
        }
    }

    public function getMessage(EmailAccountDTO $account, string $messageId): array
    {
        $this->assertProvider($account, 'imap_smtp');
        $this->assertActive($account);
        $this->assertImapConfig($account);

        $mailbox = $this->openImapConnection($account, 'INBOX');

        try {
            $uid = (int) $messageId;
            $headers = imap_fetchheader($mailbox, $uid, FT_UID) ?: '';
            $structure = imap_fetchstructure($mailbox, $uid, FT_UID);
            $parsed = $this->parseStructureParts($mailbox, $uid, $structure);

            imap_close($mailbox);

            return [
                'id' => $messageId,
                'uid' => $uid,
                'headers' => $headers,
                'body' => $parsed['text'] ?? '',
                'body_html' => $parsed['html'] ?? null,
                'body_text' => $parsed['text'] ?? null,
                'attachments' => $parsed['attachments'] ?? [],
                'structure' => $structure ? (array) $structure : [],
            ];
        } catch (\Throwable $e) {
            @imap_close($mailbox);
            throw $e;
        }
    }

    public function getThread(EmailAccountDTO $account, string $threadId): array
    {
        return ['id' => $threadId, 'messages' => []];
    }

    public function getAttachment(EmailAccountDTO $account, string $messageId, string $attachmentId): string
    {
        $this->assertProvider($account, 'imap_smtp');
        $this->assertActive($account);
        $this->assertImapConfig($account);

        $mailbox = $this->openImapConnection($account, 'INBOX');

        try {
            $uid = (int) $messageId;
            $partNum = (string) $attachmentId;
            $raw = imap_fetchbody($mailbox, $uid, $partNum, FT_UID) ?: '';
            $structure = imap_fetchstructure($mailbox, $uid, FT_UID);

            $encoding = 0;
            if ($structure !== false) {
                $part = $this->findPartByNumber($structure, $partNum);
                $encoding = (int) ($part->encoding ?? 0);
            }

            imap_close($mailbox);

            return match ($encoding) {
                3 => base64_decode($raw) ?: '',
                4 => quoted_printable_decode($raw),
                default => $raw,
            };
        } catch (\Throwable $e) {
            @imap_close($mailbox);
            throw $e;
        }
    }

    public function markAsRead(EmailAccountDTO $account, string $messageId): void
    {
        $this->assertProvider($account, 'imap_smtp');
        $this->assertActive($account);
        $this->assertImapConfig($account);

        $mailbox = $this->openImapConnection($account, 'INBOX');

        try {
            imap_setflag_full($mailbox, (string) ((int) $messageId), '\\Seen', ST_UID);
        } finally {
            imap_close($mailbox);
        }
    }

    public function trashMessage(EmailAccountDTO $account, string $messageId): void
    {
        $this->assertProvider($account, 'imap_smtp');
        $this->assertActive($account);
        $this->assertImapConfig($account);

        $mailbox = $this->openImapConnection($account, 'INBOX');

        try {
            imap_delete($mailbox, (string) ((int) $messageId), FT_UID);
            imap_expunge($mailbox);
        } finally {
            imap_close($mailbox);
        }
    }

    public function listHistory(EmailAccountDTO $account, string $startHistoryId): array
    {
        return [
            'history' => [],
            'historyId' => $startHistoryId !== '' ? $startHistoryId : (string) time(),
        ];
    }

    public function getProfile(EmailAccountDTO $account): array
    {
        $this->assertProvider($account, 'imap_smtp');
        $this->assertActive($account);
        $this->assertImapConfig($account);

        $mailbox = $this->openImapConnection($account, 'INBOX');
        $check = imap_check($mailbox);
        imap_close($mailbox);

        return [
            'email' => $account->email,
            'mailbox' => $check ? (array) $check : [],
            'historyId' => (string) time(),
        ];
    }

    /**
     * Fast, structured IMAP/SMTP health check.
     *
     * @return array{
     *   ok:bool,
     *   message:string,
     *   smtp:?array{ok:bool,code:string,message:string,fix:?string},
     *   imap:?array{ok:bool,code:string,message:string,fix:?string}
     * }
     */
    public function diagnoseConnection(EmailAccountDTO $account): array
    {
        $this->assertProvider($account, 'imap_smtp');

        $smtp = null;
        $imap = null;

        if ($account->smtpHost !== null && $account->smtpPort !== null) {
            $smtp = $this->diagnoseSmtp($account);
        }

        if ($account->imapHost !== null && $account->imapPort !== null) {
            $imap = $this->diagnoseImap($account);
        }

        if ($smtp === null && $imap === null) {
            return [
                'ok' => false,
                'message' => 'IMAP/SMTP settings are incomplete. Add host and port for both, then try again.',
                'smtp' => null,
                'imap' => null,
            ];
        }

        // Sending requires SMTP. Missing PHP IMAP extension is a server limitation, not bad credentials.
        $smtpOk = $smtp === null || ($smtp['ok'] === true);
        $imapOk = $imap === null
            || ($imap['ok'] === true)
            || ($imap['code'] === 'extension_missing');

        $ok = $smtpOk && $imapOk;
        $message = $this->buildDiagnosisSummary($ok, $smtp, $imap);

        return [
            'ok' => $ok,
            'message' => $message,
            'smtp' => $smtp,
            'imap' => $imap,
        ];
    }

    public function testConnection(EmailAccountDTO $account): bool
    {
        $diagnosis = $this->diagnoseConnection($account);

        if (! $diagnosis['ok']) {
            throw ValidationException::withMessages([
                'connection' => [$diagnosis['message']],
            ]);
        }

        return true;
    }

    /**
     * @return array{ok:bool,code:string,message:string,fix:?string}
     */
    private function diagnoseSmtp(EmailAccountDTO $account): array
    {
        if (trim((string) ($account->smtpPassword ?? '')) === '') {
            return [
                'ok' => false,
                'code' => 'missing_password',
                'message' => 'SMTP password is missing.',
                'fix' => 'Enter the SMTP password (for Gmail use an App Password) and save again.',
            ];
        }

        $host = trim((string) $account->smtpHost);
        $port = (int) ($account->smtpPort ?? 0);
        $encryption = strtolower(trim((string) ($account->smtpEncryption ?? '')));
        $username = trim((string) ($account->smtpUsername ?? $account->email));
        $password = (string) $account->smtpPassword;

        if ($host === '' || $port < 1) {
            return [
                'ok' => false,
                'code' => 'invalid_host',
                'message' => 'SMTP host or port is invalid.',
                'fix' => 'Set a valid SMTP host and port (Gmail: smtp.gmail.com, 465 SSL or 587 TLS).',
            ];
        }

        $implicitSsl = $encryption === 'ssl' || $port === 465;
        $timeoutSeconds = 6.0;

        try {
            $this->probeMailHost($host, $port, $implicitSsl, $timeoutSeconds, 'SMTP');

            $transport = new EsmtpTransport($host, $port, $implicitSsl);
            $transport->setUsername($username);
            $transport->setPassword($password);
            /** @var \Symfony\Component\Mailer\Transport\Smtp\Stream\SocketStream $stream */
            $stream = $transport->getStream();
            $stream->setTimeout($timeoutSeconds);
            $transport->start();
            $transport->stop();

            return [
                'ok' => true,
                'code' => 'ok',
                'message' => "SMTP verified ({$host}:{$port}).",
                'fix' => null,
            ];
        } catch (\Throwable $e) {
            Log::warning('SMTP connection test failed.', [
                'email' => $account->email,
                'host' => $host,
                'port' => $port,
                'encryption' => $encryption,
                'error' => $e->getMessage(),
            ]);

            return $this->classifyMailFailure($e->getMessage(), 'SMTP', $host, $port, $encryption);
        }
    }

    /**
     * @return array{ok:bool,code:string,message:string,fix:?string}
     */
    private function diagnoseImap(EmailAccountDTO $account): array
    {
        if (! function_exists('imap_open')) {
            return [
                'ok' => false,
                'code' => 'extension_missing',
                'message' => 'Inbox (IMAP) cannot be tested on this server.',
                'fix' => 'Enable the PHP IMAP extension (php.ini: extension=imap) and restart Apache/PHP, or use Google/Microsoft OAuth for inbox sync. SMTP sending can still work without IMAP.',
            ];
        }

        if (trim((string) ($account->imapPassword ?? '')) === '') {
            return [
                'ok' => false,
                'code' => 'missing_password',
                'message' => 'IMAP password is missing.',
                'fix' => 'Enter the IMAP password (or App Password) and save again.',
            ];
        }

        $host = trim((string) ($account->imapHost ?? ''));
        $port = (int) ($account->imapPort ?? 0);
        $encryption = strtolower(trim((string) ($account->imapEncryption ?? '')));

        if ($host === '' || $port < 1) {
            return [
                'ok' => false,
                'code' => 'invalid_host',
                'message' => 'IMAP host or port is invalid.',
                'fix' => 'Set a valid IMAP host and port (Gmail: imap.gmail.com:993 SSL).',
            ];
        }

        $implicitSsl = $encryption === 'ssl' || $port === 993;

        try {
            $this->probeMailHost($host, $port, $implicitSsl, 6.0, 'IMAP');
            $mailbox = $this->openImapConnection($account, 'INBOX');
            imap_close($mailbox);

            return [
                'ok' => true,
                'code' => 'ok',
                'message' => "IMAP verified ({$host}:{$port}).",
                'fix' => null,
            ];
        } catch (ValidationException $e) {
            $raw = (string) (collect($e->errors())->flatten()->first() ?: $e->getMessage());

            return $this->classifyMailFailure($raw, 'IMAP', $host, $port, $encryption);
        } catch (\Throwable $e) {
            Log::warning('IMAP connection test failed.', [
                'email' => $account->email,
                'error' => $e->getMessage(),
            ]);

            return $this->classifyMailFailure($e->getMessage(), 'IMAP', $host, $port, $encryption);
        }
    }

    private function probeMailHost(string $host, int $port, bool $ssl, float $timeoutSeconds, string $channel): void
    {
        $target = sprintf('%s://%s:%d', $ssl ? 'ssl' : 'tcp', $host, $port);
        $errno = 0;
        $errstr = '';
        $context = stream_context_create([
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
                'allow_self_signed' => true,
            ],
        ]);

        $socket = @stream_socket_client(
            $target,
            $errno,
            $errstr,
            $timeoutSeconds,
            STREAM_CLIENT_CONNECT,
            $context,
        );

        if ($socket === false) {
            $detail = trim($errstr !== '' ? $errstr : "errno {$errno}");
            throw new \RuntimeException("{$channel} probe failed for {$host}:{$port}: {$detail}");
        }

        fclose($socket);
    }

    /**
     * @return array{ok:bool,code:string,message:string,fix:?string}
     */
    private function classifyMailFailure(
        string $raw,
        string $channel,
        string $host,
        int $port,
        string $encryption,
    ): array {
        $raw = trim(preg_replace('/\s+/', ' ', $raw) ?? $raw);
        $lower = strtolower($raw);
        $endpoint = "{$host}:{$port}" . ($encryption !== '' ? " ({$encryption})" : '');

        if (
            str_contains($lower, 'authentication')
            || str_contains($lower, 'authenticate')
            || str_contains($lower, 'invalid credentials')
            || str_contains($lower, 'login failure')
            || str_contains($lower, 'auth failed')
            || str_contains($lower, '535')
            || str_contains($lower, '534')
            || str_contains($lower, 'username and password not accepted')
        ) {
            return [
                'ok' => false,
                'code' => 'auth_failed',
                'message' => "{$channel} login was rejected for {$endpoint}.",
                'fix' => $channel === 'SMTP' || $channel === 'IMAP'
                    ? 'Use the full email as username. For Gmail/Yahoo/Outlook, use an App Password (not your normal login password), and confirm 2FA is enabled where required.'
                    : 'Check username and password.',
            ];
        }

        if (
            str_contains($lower, 'timed out')
            || str_contains($lower, 'timeout')
            || str_contains($lower, 'unable to connect')
        ) {
            $alt = $channel === 'SMTP'
                ? 'If you used port 465/SSL, try smtp.gmail.com port 587 with TLS. Outbound SMTP is often blocked on local/XAMPP or by ISPs — deploy/test on the production server if this keeps timing out.'
                : 'Confirm host/port/encryption, or test from a server that allows outbound IMAP.';

            return [
                'ok' => false,
                'code' => 'timeout',
                'message' => "{$channel} could not reach {$endpoint} (connection timed out).",
                'fix' => $alt,
            ];
        }

        if (
            str_contains($lower, 'connection refused')
            || str_contains($lower, 'failed to connect')
            || str_contains($lower, 'getaddrinfo')
            || str_contains($lower, 'name or service not known')
            || str_contains($lower, 'php_network_getaddresses')
            || str_contains($lower, 'probe failed')
        ) {
            return [
                'ok' => false,
                'code' => 'unreachable',
                'message' => "{$channel} host {$endpoint} is unreachable.",
                'fix' => 'Double-check the host name and port. Wrong host, DNS failure, or a firewall can cause this.',
            ];
        }

        if (
            str_contains($lower, 'certificate')
            || (str_contains($lower, 'ssl') && str_contains($lower, 'error'))
            || str_contains($lower, 'tls')
        ) {
            return [
                'ok' => false,
                'code' => 'tls_error',
                'message' => "{$channel} TLS/SSL failed for {$endpoint}.",
                'fix' => 'Match encryption to the port: 465/993 → SSL, 587/143 → TLS (STARTTLS).',
            ];
        }

        return [
            'ok' => false,
            'code' => 'failed',
            'message' => "{$channel} check failed for {$endpoint}.",
            'fix' => $raw !== '' ? "Server detail: {$raw}" : 'Review host, port, encryption, and credentials.',
        ];
    }

    /**
     * @param  array{ok:bool,code:string,message:string,fix:?string}|null  $smtp
     * @param  array{ok:bool,code:string,message:string,fix:?string}|null  $imap
     */
    private function buildDiagnosisSummary(bool $ok, ?array $smtp, ?array $imap): string
    {
        if ($ok) {
            $parts = [];
            if ($smtp !== null && $smtp['ok']) {
                $parts[] = $smtp['message'];
            }
            if ($imap !== null && $imap['ok']) {
                $parts[] = $imap['message'];
            } elseif ($imap !== null && ($imap['code'] ?? '') === 'extension_missing') {
                $parts[] = 'SMTP is ready. Inbox sync cannot be verified here (PHP IMAP extension disabled).';
            }

            return $parts !== [] ? implode(' ', $parts) : 'Connection test successful.';
        }

        $lines = [];
        foreach ([['SMTP', $smtp], ['IMAP', $imap]] as [$label, $part]) {
            if ($part === null || $part['ok'] === true) {
                continue;
            }
            // Extension missing is informational when SMTP already failed.
            if (($part['code'] ?? '') === 'extension_missing' && $smtp !== null && ! $smtp['ok']) {
                $lines[] = "{$label}: skipped — PHP IMAP extension is not enabled on this server (does not affect SMTP sending).";
                continue;
            }
            $line = "{$label}: {$part['message']}";
            if (! empty($part['fix'])) {
                $line .= ' → ' . $part['fix'];
            }
            $lines[] = $line;
        }

        return $lines !== [] ? implode("\n", $lines) : 'Connection test failed.';
    }

    public function parseMessage(array $rawMessage): ParsedEmailDTO
    {
        $headers = $rawMessage['headers'] ?? '';
        $bodyText = $rawMessage['body_text'] ?? $rawMessage['body'] ?? null;
        $bodyHtml = $rawMessage['body_html'] ?? null;

        $subject = '';
        $fromEmail = null;
        $fromName = null;
        $toRecipients = [];
        $ccRecipients = [];
        $messageIdHeader = '';

        if (preg_match('/^Subject:\s*(.+)$/im', $headers, $m)) {
            $subject = trim(function_exists('imap_utf8') ? imap_utf8($m[1]) : $m[1]);
        }
        if (preg_match('/^From:\s*(.+)$/im', $headers, $m) && function_exists('imap_rfc822_parse_adrlist')) {
            $from = imap_rfc822_parse_adrlist($m[1], '');
            if (! empty($from)) {
                $fromEmail = strtolower((string) ($from[0]->mailbox ?? '') . '@' . (string) ($from[0]->host ?? ''));
                $fromName = $from[0]->personal ?? null;
            }
        }
        if (preg_match('/^To:\s*(.+)$/im', $headers, $m) && function_exists('imap_rfc822_parse_adrlist')) {
            foreach (imap_rfc822_parse_adrlist($m[1], '') as $addr) {
                $toRecipients[] = [
                    'email' => strtolower((string) ($addr->mailbox ?? '') . '@' . (string) ($addr->host ?? '')),
                    'name' => $addr->personal ?? null,
                ];
            }
        }
        if (preg_match('/^Cc:\s*(.+)$/im', $headers, $m) && function_exists('imap_rfc822_parse_adrlist')) {
            foreach (imap_rfc822_parse_adrlist($m[1], '') as $addr) {
                $ccRecipients[] = [
                    'email' => strtolower((string) ($addr->mailbox ?? '') . '@' . (string) ($addr->host ?? '')),
                    'name' => $addr->personal ?? null,
                ];
            }
        }
        if (preg_match('/^Message-ID:\s*(.+)$/im', $headers, $m)) {
            $messageIdHeader = trim($m[1], " \t<>");
        }

        $sentAt = null;
        if (preg_match('/^Date:\s*(.+)$/im', $headers, $m)) {
            $ts = strtotime(trim($m[1]));
            $sentAt = $ts ? date('c', $ts) : null;
        }

        $attachments = [];
        foreach (is_array($rawMessage['attachments'] ?? null) ? $rawMessage['attachments'] : [] as $a) {
            if (! is_array($a)) {
                continue;
            }
            $attachments[] = [
                'attachment_id' => (string) ($a['part'] ?? ''),
                'filename' => (string) ($a['filename'] ?? 'attachment'),
                'mime_type' => (string) ($a['mime_type'] ?? 'application/octet-stream'),
                'size' => (int) ($a['size'] ?? 0),
            ];
        }

        $id = (string) ($rawMessage['id'] ?? '');
        $threadSeed = $messageIdHeader !== '' ? $messageIdHeader : $id;

        return new ParsedEmailDTO(
            messageId: $id,
            threadId: 'imap-' . md5($threadSeed),
            subject: $subject ?: null,
            fromName: $fromName,
            fromEmail: $fromEmail,
            toRecipients: $toRecipients,
            ccRecipients: $ccRecipients,
            bccRecipients: [],
            bodyHtml: $bodyHtml,
            bodyText: $bodyText,
            isRead: false,
            isStarred: false,
            sentAt: $sentAt,
            snippet: $bodyText ? mb_substr(strip_tags((string) $bodyText), 0, 180) : null,
            attachments: $attachments,
        );
    }

    private function buildImapSearch(string $query): string
    {
        $query = trim($query);

        if ($query === '' || strtoupper($query) === 'ALL') {
            return 'ALL';
        }

        if (preg_match('/^participants:(.+)$/i', $query, $m)) {
            $email = trim($m[1]);

            return 'OR FROM "' . $email . '" TO "' . $email . '"';
        }

        if (preg_match('/^from:(.+)$/i', $query, $m)) {
            return 'FROM "' . trim($m[1]) . '"';
        }

        if (preg_match('/^to:(.+)$/i', $query, $m)) {
            return 'TO "' . trim($m[1]) . '"';
        }

        // Never pass Gmail-style queries to IMAP.
        if (str_contains($query, ':') || str_contains($query, '(')) {
            return 'ALL';
        }

        return 'TEXT "' . addslashes($query) . '"';
    }

    /**
     * @return array{html:?string,text:?string,attachments:list<array{part:string,filename:string,mime_type:string,size:int}>}
     */
    private function parseStructureParts($mailbox, int $uid, mixed $structure): array
    {
        $result = ['html' => null, 'text' => null, 'attachments' => []];

        if ($structure === false || $structure === null) {
            $body = imap_body($mailbox, $uid, FT_UID) ?: '';
            $result['text'] = $body;

            return $result;
        }

        if (! isset($structure->parts) || ! is_array($structure->parts)) {
            $body = $this->decodePart(imap_body($mailbox, $uid, FT_UID) ?: '', (int) ($structure->encoding ?? 0));
            if (strtoupper((string) ($structure->subtype ?? '')) === 'HTML') {
                $result['html'] = $body;
            } else {
                $result['text'] = $body;
            }

            return $result;
        }

        $this->walkParts($mailbox, $uid, $structure->parts, '', $result);

        return $result;
    }

    /**
     * @param  array<int, object>  $parts
     * @param  array{html:?string,text:?string,attachments:list<array{part:string,filename:string,mime_type:string,size:int}>}  $result
     */
    private function walkParts($mailbox, int $uid, array $parts, string $prefix, array &$result): void
    {
        foreach ($parts as $index => $part) {
            $partNum = $prefix === '' ? (string) ($index + 1) : $prefix . '.' . ($index + 1);
            $type = (int) ($part->type ?? 0);
            $subtype = strtoupper((string) ($part->subtype ?? ''));
            $disposition = strtolower((string) ($part->disposition ?? ''));
            $filename = $this->partFilename($part);

            if ($filename !== null || $disposition === 'attachment') {
                $result['attachments'][] = [
                    'part' => $partNum,
                    'filename' => $filename ?? ('attachment-' . $partNum),
                    'mime_type' => strtolower((string) ($part->subtype ?? 'octet-stream')),
                    'size' => (int) ($part->bytes ?? 0),
                ];
            } elseif ($type === 0 && $subtype === 'HTML' && $result['html'] === null) {
                $result['html'] = $this->decodePart(imap_fetchbody($mailbox, $uid, $partNum, FT_UID) ?: '', (int) ($part->encoding ?? 0));
            } elseif ($type === 0 && $subtype === 'PLAIN' && $result['text'] === null) {
                $result['text'] = $this->decodePart(imap_fetchbody($mailbox, $uid, $partNum, FT_UID) ?: '', (int) ($part->encoding ?? 0));
            }

            if (isset($part->parts) && is_array($part->parts)) {
                $this->walkParts($mailbox, $uid, $part->parts, $partNum, $result);
            }
        }
    }

    private function partFilename(object $part): ?string
    {
        foreach ([$part->dparameters ?? [], $part->parameters ?? []] as $params) {
            if (! is_array($params)) {
                continue;
            }
            foreach ($params as $param) {
                if (strtolower((string) ($param->attribute ?? '')) === 'filename'
                    || strtolower((string) ($param->attribute ?? '')) === 'name') {
                    return (string) ($param->value ?? '');
                }
            }
        }

        return null;
    }

    private function decodePart(string $raw, int $encoding): string
    {
        return match ($encoding) {
            3 => base64_decode($raw) ?: '',
            4 => quoted_printable_decode($raw),
            default => $raw,
        };
    }

    private function findPartByNumber(object $structure, string $partNum): ?object
    {
        if (! isset($structure->parts) || ! is_array($structure->parts)) {
            return $structure;
        }

        $segments = explode('.', $partNum);
        $current = $structure;

        foreach ($segments as $segment) {
            $index = ((int) $segment) - 1;
            if (! isset($current->parts[$index])) {
                return null;
            }
            $current = $current->parts[$index];
        }

        return $current;
    }

    /**
     * @return \IMAP\Connection|resource
     */
    private function openImapConnection(EmailAccountDTO $account, string $mailbox)
    {
        if (! function_exists('imap_open')) {
            throw ValidationException::withMessages([
                'integration' => ['IMAP extension is not available on this server.'],
            ]);
        }

        $encryption = $account->imapEncryption === 'ssl' ? '/ssl' : ($account->imapEncryption === 'tls' ? '/tls' : '/notls');
        $mailboxStr = sprintf(
            '{%s:%d/imap%s/novalidate-cert}%s',
            $account->imapHost,
            $account->imapPort ?? 993,
            $encryption,
            $mailbox,
        );

        $connection = @imap_open(
            $mailboxStr,
            $account->imapUsername ?? $account->email,
            $account->imapPassword ?? '',
            0,
            1,
        );

        if ($connection === false) {
            $detail = $this->collectImapErrors();

            throw ValidationException::withMessages([
                'connection' => [$this->humanizeMailServerError($detail, 'IMAP')],
            ]);
        }

        return $connection;
    }

    private function collectImapErrors(): string
    {
        $parts = [];

        if (function_exists('imap_errors')) {
            $errors = imap_errors();
            if (is_array($errors)) {
                foreach ($errors as $error) {
                    $error = trim((string) $error);
                    if ($error !== '') {
                        $parts[] = $error;
                    }
                }
            }
        }

        if ($parts === [] && function_exists('imap_last_error')) {
            $last = trim((string) imap_last_error());
            if ($last !== '') {
                $parts[] = $last;
            }
        }

        return implode(' ', $parts);
    }

    private function assertProvider(EmailAccountDTO $account, string $expected): void
    {
        if ($account->provider !== $expected) {
            throw ValidationException::withMessages([
                'provider' => ['Account is not an IMAP/SMTP account.'],
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

    private function assertSmtpConfig(EmailAccountDTO $account): void
    {
        if ($account->smtpHost === null || $account->smtpPort === null) {
            throw ValidationException::withMessages([
                'account' => ['SMTP configuration is incomplete. Please update your account settings.'],
            ]);
        }
    }

    private function assertImapConfig(EmailAccountDTO $account): void
    {
        if ($account->imapHost === null || $account->imapPort === null) {
            throw ValidationException::withMessages([
                'account' => ['IMAP configuration is incomplete. Please update your account settings.'],
            ]);
        }
    }
}
