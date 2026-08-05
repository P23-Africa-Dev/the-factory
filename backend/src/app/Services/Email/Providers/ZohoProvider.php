<?php

declare(strict_types=1);

namespace App\Services\Email\Providers;

use App\Models\EmailAccount;
use App\Services\Email\EmailAccountDTO;
use App\Services\Email\EmailMessageDTO;
use App\Services\Email\EmailProviderInterface;
use App\Services\Email\ParsedEmailDTO;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * Zoho Mail provider via Zoho Mail API.
 */
class ZohoProvider implements EmailProviderInterface
{
    public function send(EmailAccountDTO $account, EmailMessageDTO $message): array
    {
        $this->assertProvider($account, 'zoho');
        $this->assertActive($account);

        $accessToken = $this->resolveAccessToken($account);
        $accountId = $this->resolveZohoAccountId($account, $accessToken);

        $payload = [
            'fromAddress' => $account->email,
            'toAddress' => implode(',', array_map(fn (array $r): string => $r['email'], $message->to)),
            'subject' => $message->subject,
            'content' => $message->bodyHtml ?? $message->bodyText ?? '',
            'mailFormat' => $message->bodyHtml ? 'html' : 'plaintext',
        ];

        if ($message->cc !== []) {
            $payload['ccAddress'] = implode(',', array_map(fn (array $r): string => $r['email'], $message->cc));
        }
        if ($message->bcc !== []) {
            $payload['bccAddress'] = implode(',', array_map(fn (array $r): string => $r['email'], $message->bcc));
        }

        if ($message->attachments !== []) {
            $payload['attachments'] = array_map(
                static fn (array $a): array => [
                    'storeName' => $a['filename'],
                    'attachmentName' => $a['filename'],
                    'attachmentPath' => base64_encode($a['content']),
                ],
                $message->attachments,
            );
        }

        $response = Http::withToken($accessToken)
            ->timeout(45)
            ->acceptJson()
            ->post($this->apiBase() . '/accounts/' . $accountId . '/messages', $payload);

        $this->throwIfFailed($response, 'send');

        /** @var array<string,mixed> $data */
        $data = $response->json();

        return [
            'id' => (string) ($data['data']['messageId'] ?? $data['data']['messageId'] ?? ''),
            'threadId' => (string) ($data['data']['threadId'] ?? $message->threadId ?? ''),
        ];
    }

    public function listMessages(EmailAccountDTO $account, string $query, ?string $pageToken = null, int $maxResults = 25): array
    {
        $this->assertProvider($account, 'zoho');
        $this->assertActive($account);

        $accessToken = $this->resolveAccessToken($account);
        $accountId = $this->resolveZohoAccountId($account, $accessToken);

        $params = [
            'limit' => $maxResults,
        ];
        if ($query !== '') {
            if (preg_match('/^participants:(.+)$/i', $query, $m)) {
                $params['searchKey'] = 'email:' . trim($m[1]);
            } else {
                $params['searchKey'] = $query;
            }
        }
        if ($pageToken !== null && $pageToken !== '') {
            $params['start'] = (int) $pageToken;
        }

        $response = Http::withToken($accessToken)
            ->timeout(45)
            ->acceptJson()
            ->get($this->apiBase() . '/accounts/' . $accountId . '/messages/view', $params);

        $this->throwIfFailed($response, 'listMessages');

        /** @var array<string,mixed> $data */
        $data = $response->json();

        $messages = is_array($data['data'] ?? null) ? $data['data'] : [];

        // Normalize id field for CrmEmailService
        $normalized = [];
        foreach ($messages as $msg) {
            if (! is_array($msg)) {
                continue;
            }
            $msg['id'] = (string) ($msg['messageId'] ?? $msg['id'] ?? '');
            $normalized[] = $msg;
        }

        return [
            'messages' => $normalized,
            'nextPageToken' => count($normalized) >= $maxResults
                ? (string) ((int) ($pageToken ?? 0) + $maxResults)
                : null,
        ];
    }

    public function getMessage(EmailAccountDTO $account, string $messageId): array
    {
        $this->assertProvider($account, 'zoho');
        $this->assertActive($account);

        $accessToken = $this->resolveAccessToken($account);
        $accountId = $this->resolveZohoAccountId($account, $accessToken);

        $folderId = $this->metadata($account)['folder_id'] ?? '1';

        $response = Http::withToken($accessToken)
            ->timeout(45)
            ->acceptJson()
            ->get($this->apiBase() . '/accounts/' . $accountId . '/folders/' . $folderId . '/messages/' . urlencode($messageId) . '/details');

        if (! $response->successful()) {
            // Fallback without folder
            $response = Http::withToken($accessToken)
                ->timeout(45)
                ->acceptJson()
                ->get($this->apiBase() . '/accounts/' . $accountId . '/messages/' . urlencode($messageId));
        }

        $this->throwIfFailed($response, 'getMessage');

        /** @var array<string,mixed> */
        return $response->json();
    }

    public function getThread(EmailAccountDTO $account, string $threadId): array
    {
        $this->assertProvider($account, 'zoho');
        $this->assertActive($account);

        $accessToken = $this->resolveAccessToken($account);
        $accountId = $this->resolveZohoAccountId($account, $accessToken);

        $response = Http::withToken($accessToken)
            ->timeout(45)
            ->acceptJson()
            ->get($this->apiBase() . '/accounts/' . $accountId . '/messages/view', [
                'threaded' => 'true',
                'searchKey' => 'threadId:' . $threadId,
            ]);

        $this->throwIfFailed($response, 'getThread');

        /** @var array<string,mixed> */
        return $response->json();
    }

    public function getAttachment(EmailAccountDTO $account, string $messageId, string $attachmentId): string
    {
        $this->assertProvider($account, 'zoho');
        $this->assertActive($account);

        $accessToken = $this->resolveAccessToken($account);
        $accountId = $this->resolveZohoAccountId($account, $accessToken);

        $response = Http::withToken($accessToken)
            ->timeout(60)
            ->get($this->apiBase() . '/accounts/' . $accountId . '/messages/' . urlencode($messageId) . '/attachments/' . urlencode($attachmentId));

        $this->throwIfFailed($response, 'getAttachment');

        return $response->body();
    }

    public function markAsRead(EmailAccountDTO $account, string $messageId): void
    {
        $this->assertProvider($account, 'zoho');
        $this->assertActive($account);

        $accessToken = $this->resolveAccessToken($account);
        $accountId = $this->resolveZohoAccountId($account, $accessToken);

        $response = Http::withToken($accessToken)
            ->timeout(30)
            ->acceptJson()
            ->put($this->apiBase() . '/accounts/' . $accountId . '/updatemessage', [
                'mode' => 'markAsRead',
                'messageId' => [(int) $messageId],
            ]);

        $this->throwIfFailed($response, 'markAsRead');
    }

    public function trashMessage(EmailAccountDTO $account, string $messageId): void
    {
        $this->assertProvider($account, 'zoho');
        $this->assertActive($account);

        $accessToken = $this->resolveAccessToken($account);
        $accountId = $this->resolveZohoAccountId($account, $accessToken);

        $response = Http::withToken($accessToken)
            ->timeout(30)
            ->acceptJson()
            ->put($this->apiBase() . '/accounts/' . $accountId . '/updatemessage', [
                'mode' => 'trash',
                'messageId' => [(int) $messageId],
            ]);

        if ($response->status() === 404) {
            return;
        }

        $this->throwIfFailed($response, 'trashMessage');
    }

    public function listHistory(EmailAccountDTO $account, string $startHistoryId): array
    {
        // Zoho has no history API — CrmEmailService falls back to listMessages backfill.
        return [
            'history' => [],
            'historyId' => $startHistoryId !== '' ? $startHistoryId : (string) time(),
        ];
    }

    public function getProfile(EmailAccountDTO $account): array
    {
        $this->assertProvider($account, 'zoho');
        $this->assertActive($account);

        $accessToken = $this->resolveAccessToken($account);
        $accountId = $this->resolveZohoAccountId($account, $accessToken);

        $response = Http::withToken($accessToken)
            ->timeout(30)
            ->acceptJson()
            ->get($this->apiBase() . '/accounts/' . $accountId);

        $this->throwIfFailed($response, 'getProfile');

        /** @var array<string,mixed> $data */
        $data = $response->json();

        return array_merge(
            is_array($data['data'] ?? null) ? $data['data'] : $data,
            ['historyId' => (string) time()],
        );
    }

    public function testConnection(EmailAccountDTO $account): bool
    {
        $this->assertProvider($account, 'zoho');

        try {
            $this->getProfile($account);

            return true;
        } catch (\Throwable $e) {
            Log::warning('Zoho email connection test failed.', [
                'email' => $account->email,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }

    public function parseMessage(array $rawMessage): ParsedEmailDTO
    {
        $data = $rawMessage['data'] ?? $rawMessage;
        if (is_array($data) && isset($data[0]) && is_array($data[0])) {
            $data = $data[0];
        }

        return new ParsedEmailDTO(
            messageId: (string) ($data['messageId'] ?? $data['id'] ?? ''),
            threadId: (string) ($data['threadId'] ?? ''),
            subject: isset($data['subject']) ? (string) $data['subject'] : null,
            fromName: isset($data['sender']) ? (string) $data['sender'] : (isset($data['from']) ? (string) $data['from'] : null),
            fromEmail: isset($data['fromAddress'])
                ? strtolower((string) $data['fromAddress'])
                : (isset($data['from']) ? strtolower((string) $data['from']) : null),
            toRecipients: array_values(array_filter(array_map(
                fn (string $e): ?array => ($e = strtolower(trim($e))) !== '' ? ['email' => $e, 'name' => null] : null,
                explode(',', (string) ($data['toAddress'] ?? $data['to'] ?? '')),
            ))),
            ccRecipients: array_values(array_filter(array_map(
                fn (string $e): ?array => ($e = strtolower(trim($e))) !== '' ? ['email' => $e, 'name' => null] : null,
                explode(',', (string) ($data['ccAddress'] ?? $data['cc'] ?? '')),
            ))),
            bccRecipients: [],
            bodyHtml: (($data['mailFormat'] ?? '') === 'html' || isset($data['content']))
                ? ($data['content'] ?? $data['html'] ?? null)
                : null,
            bodyText: ($data['mailFormat'] ?? '') === 'plaintext' ? ($data['content'] ?? null) : ($data['text'] ?? null),
            isRead: ($data['status'] ?? '') === 'read' || (bool) ($data['isRead'] ?? false),
            isStarred: false,
            sentAt: isset($data['receivedTime'])
                ? (is_numeric($data['receivedTime'])
                    ? date('c', (int) ((int) $data['receivedTime'] / 1000))
                    : (string) $data['receivedTime'])
                : null,
            snippet: isset($data['summary']) ? (string) $data['summary'] : null,
            attachments: array_map(
                fn (array $a): array => [
                    'attachment_id' => (string) ($a['attachmentId'] ?? ''),
                    'filename' => (string) ($a['attachmentName'] ?? 'attachment'),
                    'mime_type' => (string) ($a['contentType'] ?? 'application/octet-stream'),
                    'size' => (int) ($a['size'] ?? 0),
                ],
                is_array($data['attachments'] ?? null) ? $data['attachments'] : [],
            ),
        );
    }

    private function apiBase(): string
    {
        $datacenter = strtolower(trim((string) config('services.zoho_mail.datacenter', 'com')));

        return match ($datacenter) {
            'eu' => 'https://mail.zoho.eu/api',
            'in' => 'https://mail.zoho.in/api',
            'au' => 'https://mail.zoho.com.au/api',
            'jp' => 'https://mail.zoho.jp/api',
            default => 'https://mail.zoho.com/api',
        };
    }

    private function resolveAccessToken(EmailAccountDTO $account): string
    {
        $model = EmailAccount::query()->find($account->id);

        if ($model === null) {
            throw ValidationException::withMessages([
                'account' => ['Email account not found.'],
            ]);
        }

        $expiresAt = $model->token_expires_at;
        $token = (string) ($model->access_token_encrypted ?? '');

        if ($token !== '' && $expiresAt !== null && $expiresAt->copy()->subSeconds(60)->isFuture()) {
            return $token;
        }

        return $this->refreshAccessToken($model);
    }

    private function refreshAccessToken(EmailAccount $account): string
    {
        $refreshToken = (string) ($account->refresh_token_encrypted ?? '');

        if ($refreshToken === '') {
            $account->update([
                'status' => 'expired',
                'last_error_message' => 'Zoho refresh token is missing. Please reconnect.',
                'last_error_at' => now(),
            ]);

            throw ValidationException::withMessages([
                'account' => ['Zoho account access expired. Please reconnect.'],
            ]);
        }

        $clientId = trim((string) config('services.zoho_mail.client_id'));
        $clientSecret = trim((string) config('services.zoho_mail.client_secret'));
        $accountsBase = $this->accountsBase();

        if ($clientId === '' || $clientSecret === '') {
            throw ValidationException::withMessages([
                'integration' => ['Zoho OAuth is not configured. Contact platform support.'],
            ]);
        }

        $response = Http::asForm()
            ->timeout(30)
            ->post($accountsBase . '/oauth/v2/token', [
                'client_id' => $clientId,
                'client_secret' => $clientSecret,
                'grant_type' => 'refresh_token',
                'refresh_token' => $refreshToken,
            ]);

        if (! $response->successful()) {
            $account->update([
                'status' => 'error',
                'last_error_message' => 'Zoho token refresh failed.',
                'last_error_at' => now(),
            ]);

            throw ValidationException::withMessages([
                'integration' => ['Zoho token refresh failed. Please reconnect your account.'],
            ]);
        }

        /** @var array<string,mixed> $payload */
        $payload = $response->json();
        $accessToken = trim((string) ($payload['access_token'] ?? ''));

        if ($accessToken === '') {
            throw ValidationException::withMessages([
                'integration' => ['Zoho token refresh did not return an access token.'],
            ]);
        }

        $expiresIn = isset($payload['expires_in']) ? max(0, (int) $payload['expires_in']) : 3600;

        $account->update([
            'access_token_encrypted' => $accessToken,
            'token_expires_at' => now()->addSeconds($expiresIn),
            'last_token_refresh_at' => now(),
            'status' => 'active',
            'last_error_message' => null,
            'last_error_at' => null,
        ]);

        return $accessToken;
    }

    private function accountsBase(): string
    {
        $datacenter = strtolower(trim((string) config('services.zoho_mail.datacenter', 'com')));

        return match ($datacenter) {
            'eu' => 'https://accounts.zoho.eu',
            'in' => 'https://accounts.zoho.in',
            'au' => 'https://accounts.zoho.com.au',
            'jp' => 'https://accounts.zoho.jp',
            default => 'https://accounts.zoho.com',
        };
    }

    private function resolveZohoAccountId(EmailAccountDTO $account, string $accessToken): string
    {
        $meta = $this->metadata($account);
        if (! empty($meta['zoho_account_id'])) {
            return (string) $meta['zoho_account_id'];
        }

        $response = Http::withToken($accessToken)
            ->timeout(30)
            ->acceptJson()
            ->get($this->apiBase() . '/accounts');

        $this->throwIfFailed($response, 'listAccounts');

        /** @var array<string,mixed> $data */
        $data = $response->json();
        $accounts = is_array($data['data'] ?? null) ? $data['data'] : [];

        $matched = null;
        foreach ($accounts as $item) {
            if (! is_array($item)) {
                continue;
            }
            $email = strtolower((string) ($item['primaryEmailAddress'] ?? $item['emailAddress'] ?? ''));
            if ($email === strtolower($account->email)) {
                $matched = $item;
                break;
            }
        }

        if ($matched === null && $accounts !== [] && is_array($accounts[0])) {
            $matched = $accounts[0];
        }

        $accountId = (string) ($matched['accountId'] ?? '');

        if ($accountId === '') {
            throw ValidationException::withMessages([
                'integration' => ['Unable to resolve Zoho Mail account id. Please reconnect.'],
            ]);
        }

        $model = EmailAccount::query()->find($account->id);
        if ($model !== null) {
            $existing = is_array($model->provider_metadata) ? $model->provider_metadata : [];
            $existing['zoho_account_id'] = $accountId;
            $model->update(['provider_metadata' => $existing]);
        }

        return $accountId;
    }

    /**
     * @return array<string, mixed>
     */
    private function metadata(EmailAccountDTO $account): array
    {
        $model = EmailAccount::query()->find($account->id);

        return is_array($model?->provider_metadata) ? $model->provider_metadata : [];
    }

    private function throwIfFailed(\Illuminate\Http\Client\Response $response, string $operation): void
    {
        if ($response->status() === 401 || $response->status() === 403) {
            throw ValidationException::withMessages([
                'integration' => ['Zoho authorization failed. Please reconnect your account.'],
            ]);
        }

        if ($response->status() === 429) {
            throw ValidationException::withMessages([
                'integration' => ['Zoho rate limit reached. Please try again shortly.'],
            ]);
        }

        if (! $response->successful()) {
            Log::error('Zoho Mail API request failed.', [
                'operation' => $operation,
                'status' => $response->status(),
                'body' => $response->json() ?? $response->body(),
            ]);

            throw ValidationException::withMessages([
                'integration' => ['Zoho API error: ' . $response->status()],
            ]);
        }
    }

    private function assertProvider(EmailAccountDTO $account, string $expected): void
    {
        if ($account->provider !== $expected) {
            throw ValidationException::withMessages([
                'provider' => ['Account is not a Zoho account.'],
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
