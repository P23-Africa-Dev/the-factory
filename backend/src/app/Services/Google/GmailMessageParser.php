<?php

declare(strict_types=1);

namespace App\Services\Google;

class GmailMessageParser
{
    /**
     * @param  array<string,mixed>  $message
     * @return array{
     *   gmail_message_id:string,
     *   gmail_thread_id:string,
     *   subject:?string,
     *   from_name:?string,
     *   from_email:?string,
     *   to_recipients:array<int,array{email:string,name:?string}>,
     *   cc_recipients:array<int,array{email:string,name:?string}>,
     *   bcc_recipients:array<int,array{email:string,name:?string}>,
     *   body_html:?string,
     *   body_text:?string,
     *   is_read:bool,
     *   is_starred:bool,
     *   sent_at:?string,
     *   snippet:?string,
     *   attachments:array<int,array{attachment_id:string,filename:string,mime_type:string,size:int}>
     * }
     */
    public function parse(array $message): array
    {
        $headers = $this->headersMap($message);
        $payload = is_array($message['payload'] ?? null) ? $message['payload'] : [];
        $body = $this->extractBodies($payload);
        $attachments = $this->extractAttachments($payload);

        $from = $this->parseAddressHeader($headers['from'] ?? '');
        $sentAt = isset($message['internalDate'])
            ? date('c', (int) (((int) $message['internalDate']) / 1000))
            : null;

        $labelIds = is_array($message['labelIds'] ?? null) ? $message['labelIds'] : [];

        return [
            'gmail_message_id' => (string) ($message['id'] ?? ''),
            'gmail_thread_id' => (string) ($message['threadId'] ?? ''),
            'subject' => $headers['subject'] ?? null,
            'from_name' => $from['name'],
            'from_email' => $from['email'],
            'to_recipients' => $this->parseAddressListHeader($headers['to'] ?? ''),
            'cc_recipients' => $this->parseAddressListHeader($headers['cc'] ?? ''),
            'bcc_recipients' => $this->parseAddressListHeader($headers['bcc'] ?? ''),
            'body_html' => $body['html'],
            'body_text' => $body['text'],
            'is_read' => ! in_array('UNREAD', $labelIds, true),
            'is_starred' => in_array('STARRED', $labelIds, true),
            'sent_at' => $sentAt,
            'snippet' => isset($message['snippet']) ? (string) $message['snippet'] : null,
            'attachments' => $attachments,
        ];
    }

    /**
     * @param  array<string,mixed>  $message
     * @return array<string,string>
     */
    private function headersMap(array $message): array
    {
        $payload = is_array($message['payload'] ?? null) ? $message['payload'] : [];
        $headers = is_array($payload['headers'] ?? null) ? $payload['headers'] : [];
        $map = [];

        foreach ($headers as $header) {
            if (! is_array($header)) {
                continue;
            }

            $name = strtolower(trim((string) ($header['name'] ?? '')));
            $value = trim((string) ($header['value'] ?? ''));

            if ($name !== '') {
                $map[$name] = $value;
            }
        }

        return $map;
    }

    /**
     * @param  array<string,mixed>  $payload
     * @return array{html:?string,text:?string}
     */
    private function extractBodies(array $payload): array
    {
        $html = null;
        $text = null;

        $this->walkParts($payload, function (array $part) use (&$html, &$text): void {
            $mimeType = strtolower((string) ($part['mimeType'] ?? ''));
            $bodyData = is_array($part['body'] ?? null) ? (string) ($part['body']['data'] ?? '') : '';

            if ($bodyData === '') {
                return;
            }

            $decoded = $this->decodeBody($bodyData);

            if ($mimeType === 'text/html' && $html === null) {
                $html = $decoded;
            }

            if ($mimeType === 'text/plain' && $text === null) {
                $text = $decoded;
            }
        });

        return ['html' => $html, 'text' => $text];
    }

    /**
     * @param  array<string,mixed>  $payload
     * @return list<array{attachment_id:string,filename:string,mime_type:string,size:int}>
     */
    private function extractAttachments(array $payload): array
    {
        $attachments = [];

        $this->walkParts($payload, function (array $part) use (&$attachments): void {
            $filename = '';

            if (is_array($part['filename'] ?? null)) {
                $filename = (string) $part['filename'];
            } else {
                $filename = (string) ($part['filename'] ?? '');
            }

            $body = is_array($part['body'] ?? null) ? $part['body'] : [];
            $attachmentId = trim((string) ($body['attachmentId'] ?? ''));

            if ($attachmentId === '') {
                return;
            }

            $attachments[] = [
                'attachment_id' => $attachmentId,
                'filename' => $filename !== '' ? $filename : 'attachment',
                'mime_type' => (string) ($part['mimeType'] ?? 'application/octet-stream'),
                'size' => (int) ($body['size'] ?? 0),
            ];
        });

        return $attachments;
    }

    /**
     * @param  array<string,mixed>  $part
     * @param  callable(array<string,mixed>):void  $visitor
     */
    private function walkParts(array $part, callable $visitor): void
    {
        $visitor($part);

        $parts = is_array($part['parts'] ?? null) ? $part['parts'] : [];

        foreach ($parts as $child) {
            if (is_array($child)) {
                $this->walkParts($child, $visitor);
            }
        }
    }

    private function decodeBody(string $data): string
    {
        $decoded = base64_decode(strtr($data, '-_', '+/'), true);

        return $decoded !== false ? $decoded : '';
    }

    /**
     * @return array{email:?string,name:?string}
     */
    private function parseAddressHeader(string $raw): array
    {
        $raw = trim($raw);

        if ($raw === '') {
            return ['email' => null, 'name' => null];
        }

        if (preg_match('/^(?:"?([^"<]*)"?\s)?<?([^>]+@[^>]+)>?$/', $raw, $matches) === 1) {
            return [
                'name' => trim((string) ($matches[1] ?? '')) ?: null,
                'email' => strtolower(trim((string) ($matches[2] ?? ''))) ?: null,
            ];
        }

        return ['email' => strtolower($raw), 'name' => null];
    }

    /**
     * @return list<array{email:string,name:?string}>
     */
    private function parseAddressListHeader(string $raw): array
    {
        if (trim($raw) === '') {
            return [];
        }

        $parts = preg_split('/,(?=(?:[^"]*"[^"]*")*[^"]*$)/', $raw) ?: [];
        $result = [];

        foreach ($parts as $part) {
            $parsed = $this->parseAddressHeader(trim((string) $part));

            if ($parsed['email'] !== null) {
                $result[] = [
                    'email' => $parsed['email'],
                    'name' => $parsed['name'],
                ];
            }
        }

        return $result;
    }
}
