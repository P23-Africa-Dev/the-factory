<?php

declare(strict_types=1);

namespace App\Services\Google;

use App\Models\CompanyCalendarConnection;
use App\Models\UserCalendarConnection;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class GmailApiService
{
    public function __construct(
        private readonly GoogleTokenService $tokenService,
        private readonly GmailMimeBuilder $mimeBuilder,
    ) {}

    /**
     * @param  list<array{email:string,name?:string}>  $to
     * @param  list<array{email:string,name?:string}>  $cc
     * @param  list<array{email:string,name?:string}>  $bcc
     * @param  list<array{filename:string,mime_type:string,content:string}>  $attachments
     * @param  list<string>  $extraHeaders
     * @return array{id:string,threadId:string}
     */
    public function sendMessage(
        CompanyCalendarConnection|UserCalendarConnection $connection,
        array $to,
        array $cc,
        array $bcc,
        string $subject,
        string $bodyHtml,
        string $bodyText,
        array $attachments = [],
        ?string $threadId = null,
        array $extraHeaders = [],
    ): array {
        $fromEmail = (string) $connection->organizer_email;
        $fromName = (string) ($connection->organizer_name ?? '');

        $mime = $this->mimeBuilder->build(
            fromEmail: $fromEmail,
            fromName: $fromName !== '' ? $fromName : null,
            to: $to,
            cc: $cc,
            bcc: $bcc,
            subject: $subject,
            bodyHtml: $bodyHtml,
            bodyText: $bodyText,
            attachments: $attachments,
            extraHeaders: $extraHeaders,
        );

        $payload = [
            'raw' => $this->base64UrlEncode($mime),
        ];

        if ($threadId !== null && $threadId !== '') {
            $payload['threadId'] = $threadId;
        }

        $response = $this->request($connection, 'POST', 'https://www.googleapis.com/gmail/v1/users/me/messages/send', $payload);

        /** @var array<string,mixed> $data */
        $data = $response->json();

        return [
            'id' => (string) ($data['id'] ?? ''),
            'threadId' => (string) ($data['threadId'] ?? $threadId ?? ''),
        ];
    }

    /**
     * @return array{messages:array<int,array<string,mixed>>,nextPageToken:?string}
     */
    public function listMessagesForQuery(
        CompanyCalendarConnection|UserCalendarConnection $connection,
        string $query,
        ?string $pageToken = null,
        int $maxResults = 25,
    ): array {
        $queryParams = [
            'q' => $query,
            'maxResults' => $maxResults,
        ];

        if ($pageToken !== null && $pageToken !== '') {
            $queryParams['pageToken'] = $pageToken;
        }

        $response = $this->request(
            $connection,
            'GET',
            'https://www.googleapis.com/gmail/v1/users/me/messages?' . http_build_query($queryParams),
        );

        /** @var array<string,mixed> $data */
        $data = $response->json();

        return [
            'messages' => is_array($data['messages'] ?? null) ? $data['messages'] : [],
            'nextPageToken' => isset($data['nextPageToken']) ? (string) $data['nextPageToken'] : null,
        ];
    }

    /**
     * @return array<string,mixed>
     */
    public function getMessage(CompanyCalendarConnection|UserCalendarConnection $connection, string $messageId, string $format = 'full'): array
    {
        $response = $this->request(
            $connection,
            'GET',
            'https://www.googleapis.com/gmail/v1/users/me/messages/' . urlencode($messageId) . '?format=' . urlencode($format),
        );

        /** @var array<string,mixed> */
        return $response->json();
    }

    /**
     * @return array<string,mixed>
     */
    public function getThread(CompanyCalendarConnection|UserCalendarConnection $connection, string $threadId): array
    {
        $response = $this->request(
            $connection,
            'GET',
            'https://www.googleapis.com/gmail/v1/users/me/threads/' . urlencode($threadId) . '?format=full',
        );

        /** @var array<string,mixed> */
        return $response->json();
    }

    public function getAttachment(CompanyCalendarConnection|UserCalendarConnection $connection, string $messageId, string $attachmentId): string
    {
        $response = $this->request(
            $connection,
            'GET',
            'https://www.googleapis.com/gmail/v1/users/me/messages/' . urlencode($messageId) . '/attachments/' . urlencode($attachmentId),
        );

        /** @var array<string,mixed> $data */
        $data = $response->json();
        $encoded = (string) ($data['data'] ?? '');

        return base64_decode(strtr($encoded, '-_', '+/')) ?: '';
    }

    public function markAsRead(CompanyCalendarConnection|UserCalendarConnection $connection, string $messageId): void
    {
        $this->request(
            $connection,
            'POST',
            'https://www.googleapis.com/gmail/v1/users/me/messages/' . urlencode($messageId) . '/modify',
            [
                'removeLabelIds' => ['UNREAD'],
            ],
        );
    }

    public function trashMessage(CompanyCalendarConnection|UserCalendarConnection $connection, string $messageId): void
    {
        $this->request(
            $connection,
            'POST',
            'https://www.googleapis.com/gmail/v1/users/me/messages/' . urlencode($messageId) . '/trash',
        );
    }

    /**
     * @return array{history:array<int,array<string,mixed>>,historyId:?string}
     */
    public function listHistory(CompanyCalendarConnection|UserCalendarConnection $connection, string $startHistoryId): array
    {
        $response = $this->request(
            $connection,
            'GET',
            'https://www.googleapis.com/gmail/v1/users/me/history?' . http_build_query([
                'startHistoryId' => $startHistoryId,
                'historyTypes' => ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
            ]),
        );

        /** @var array<string,mixed> $data */
        $data = $response->json();

        return [
            'history' => is_array($data['history'] ?? null) ? $data['history'] : [],
            'historyId' => isset($data['historyId']) ? (string) $data['historyId'] : null,
        ];
    }

    public function getProfile(CompanyCalendarConnection|UserCalendarConnection $connection): array
    {
        $response = $this->request($connection, 'GET', 'https://www.googleapis.com/gmail/v1/users/me/profile');

        /** @var array<string,mixed> */
        return $response->json();
    }

    /**
     * @param  array<string,mixed>|null  $json
     */
    private function request(
        CompanyCalendarConnection|UserCalendarConnection $connection,
        string $method,
        string $url,
        ?array $json = null,
    ): Response {
        $accessToken = $this->tokenService->resolveAccessToken($connection);

        $pending = Http::withToken($accessToken)->timeout(45)->acceptJson();

        $response = match (strtoupper($method)) {
            'GET' => $pending->get($url),
            'POST' => $pending->post($url, $json ?? []),
            'DELETE' => $pending->delete($url),
            default => $pending->send($method, $url, ['json' => $json]),
        };

        if ($response->status() === 401 || $response->status() === 403) {
            $connection->update([
                'status' => 'error',
                'last_error_message' => 'Gmail authorization failed. Reconnect Google account.',
                'last_error_at' => now(),
            ]);

            throw ValidationException::withMessages([
                'integration' => ['Gmail authorization failed. Please reconnect your Google account.'],
            ]);
        }

        if ($response->status() === 429) {
            throw ValidationException::withMessages([
                'integration' => ['Gmail rate limit reached. Please try again shortly.'],
            ]);
        }

        if (! $response->successful()) {
            Log::error('Gmail API request failed.', [
                'url' => $url,
                'status' => $response->status(),
                'body' => $response->json() ?? $response->body(),
            ]);

            throw ValidationException::withMessages([
                'integration' => ['Gmail API error: ' . $this->responseErrorMessage($response)],
            ]);
        }

        return $response;
    }

    private function responseErrorMessage(Response $response): string
    {
        /** @var array<string,mixed> $payload */
        $payload = $response->json();
        $message = trim((string) Arr::get($payload, 'error.message', ''));

        return $message !== '' ? $message : 'Unknown Gmail API error.';
    }

    private function base64UrlEncode(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }
}
