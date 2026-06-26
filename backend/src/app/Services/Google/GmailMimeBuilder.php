<?php

declare(strict_types=1);

namespace App\Services\Google;

class GmailMimeBuilder
{
    /**
     * @param  list<array{email:string,name?:string}>  $to
     * @param  list<array{email:string,name?:string}>  $cc
     * @param  list<array{email:string,name?:string}>  $bcc
     * @param  list<array{filename:string,mime_type:string,content:string}>  $attachments
     * @param  list<string>  $extraHeaders
     */
    public function build(
        string $fromEmail,
        ?string $fromName,
        array $to,
        array $cc,
        array $bcc,
        string $subject,
        string $bodyHtml,
        string $bodyText,
        array $attachments = [],
        array $extraHeaders = [],
    ): string {
        $boundaryMixed = 'mixed_' . bin2hex(random_bytes(8));
        $boundaryAlt = 'alt_' . bin2hex(random_bytes(8));

        $fromHeader = $this->formatAddress($fromEmail, $fromName);
        $headers = [
            'From: ' . $fromHeader,
            'To: ' . $this->formatAddressList($to),
            'Subject: ' . $this->encodeHeader($subject),
            'MIME-Version: 1.0',
        ];

        if ($cc !== []) {
            $headers[] = 'Cc: ' . $this->formatAddressList($cc);
        }

        if ($bcc !== []) {
            $headers[] = 'Bcc: ' . $this->formatAddressList($bcc);
        }

        foreach ($extraHeaders as $header) {
            $headers[] = $header;
        }

        if ($attachments === []) {
            $headers[] = 'Content-Type: multipart/alternative; boundary="' . $boundaryAlt . '"';
            $body = implode("\r\n", $headers) . "\r\n\r\n";
            $body .= $this->buildAlternativePart($boundaryAlt, $bodyText, $bodyHtml);

            return $body;
        }

        $headers[] = 'Content-Type: multipart/mixed; boundary="' . $boundaryMixed . '"';
        $body = implode("\r\n", $headers) . "\r\n\r\n";
        $body .= '--' . $boundaryMixed . "\r\n";
        $body .= 'Content-Type: multipart/alternative; boundary="' . $boundaryAlt . '"' . "\r\n\r\n";
        $body .= $this->buildAlternativePart($boundaryAlt, $bodyText, $bodyHtml);
        $body .= "\r\n";

        foreach ($attachments as $attachment) {
            $body .= '--' . $boundaryMixed . "\r\n";
            $body .= 'Content-Type: ' . $attachment['mime_type'] . '; name="' . $this->encodeHeader($attachment['filename']) . '"' . "\r\n";
            $body .= 'Content-Disposition: attachment; filename="' . $this->encodeHeader($attachment['filename']) . '"' . "\r\n";
            $body .= 'Content-Transfer-Encoding: base64' . "\r\n\r\n";
            $body .= chunk_split(base64_encode($attachment['content']), 76, "\r\n");
        }

        $body .= '--' . $boundaryMixed . '--';

        return $body;
    }

    private function buildAlternativePart(string $boundaryAlt, string $bodyText, string $bodyHtml): string
    {
        $part = '--' . $boundaryAlt . "\r\n";
        $part .= "Content-Type: text/plain; charset=UTF-8\r\n";
        $part .= "Content-Transfer-Encoding: quoted-printable\r\n\r\n";
        $part .= quoted_printable_encode($bodyText) . "\r\n";
        $part .= '--' . $boundaryAlt . "\r\n";
        $part .= "Content-Type: text/html; charset=UTF-8\r\n";
        $part .= "Content-Transfer-Encoding: quoted-printable\r\n\r\n";
        $part .= quoted_printable_encode($bodyHtml) . "\r\n";
        $part .= '--' . $boundaryAlt . '--';

        return $part;
    }

    /**
     * @param  list<array{email:string,name?:string}>  $addresses
     */
    private function formatAddressList(array $addresses): string
    {
        return implode(', ', array_map(
            fn (array $address): string => $this->formatAddress($address['email'], $address['name'] ?? null),
            $addresses,
        ));
    }

    private function formatAddress(string $email, ?string $name): string
    {
        $email = trim($email);
        $name = trim((string) $name);

        if ($name === '') {
            return $email;
        }

        return $this->encodeHeader($name) . ' <' . $email . '>';
    }

    private function encodeHeader(string $value): string
    {
        if (preg_match('/[^\x20-\x7E]/', $value) === 1) {
            return '=?UTF-8?B?' . base64_encode($value) . '?=';
        }

        return $value;
    }
}
