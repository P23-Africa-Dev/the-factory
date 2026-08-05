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
 * Microsoft 365 / Outlook provider via Microsoft Graph API.
 */
class MicrosoftProvider implements EmailProviderInterface
{
    private const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

    public function send(EmailAccountDTO $account, EmailMessageDTO $message): array
    {
        $this->assertProvider($account, 'microsoft');
        $this->assertActive($account);

        $accessToken = $this->resolveAccessToken($account);

        $graphMessage = [
            'subject' => $message->subject,
            'body' => [
                'contentType' => $message->bodyHtml ? 'HTML' : 'Text',
                'content' => $message->bodyHtml ?? $message->bodyText ?? '',
            ],
            'toRecipients' => $this->formatRecipients($message->to),
            'ccRecipients' => $this->formatRecipients($message->cc),
            'bccRecipients' => $this->formatRecipients($message->bcc),
        ];

        if ($message->attachments !== []) {
            $graphMessage['attachments'] = array_map(
                static fn (array $a): array => [
                    '@odata.type' => '#microsoft.graph.fileAttachment',
                    'name' => $a['filename'],
                    'contentType' => $a['mime_type'],
                    'contentBytes' => base64_encode($a['content']),
                ],
                $message->attachments,
            );
        }

        if ($message->threadId !== null && $message->threadId !== '') {
            $graphMessage['conversationId'] = $message->threadId;
        }

        // Create then send so we get a real message id + conversationId.
        $createResponse = Http::withToken($accessToken)
            ->timeout(45)
            ->acceptJson()
            ->post(self::GRAPH_BASE . '/me/messages', $graphMessage);

        $this->throwIfFailed($createResponse, 'createMessage');

        /** @var array<string,mixed> $created */
        $created = $createResponse->json();
        $messageId = (string) ($created['id'] ?? '');
        $conversationId = (string) ($created['conversationId'] ?? $message->threadId ?? '');

        if ($messageId === '') {
            throw ValidationException::withMessages([
                'integration' => ['Microsoft did not return a message id after creating the draft.'],
            ]);
        }

        $sendResponse = Http::withToken($accessToken)
            ->timeout(45)
            ->acceptJson()
            ->post(self::GRAPH_BASE . '/me/messages/' . urlencode($messageId) . '/send');

        $this->throwIfFailed($sendResponse, 'send');

        return [
            'id' => $messageId,
            'threadId' => $conversationId !== '' ? $conversationId : $messageId,
        ];
    }

    public function listMessages(EmailAccountDTO $account, string $query, ?string $pageToken = null, int $maxResults = 25): array
    {
        $this->assertProvider($account, 'microsoft');
        $this->assertActive($account);

        $accessToken = $this->resolveAccessToken($account);

        if ($pageToken !== null && $pageToken !== '') {
            $url = $pageToken;
        } else {
            $url = self::GRAPH_BASE . '/me/messages?$top=' . $maxResults . '&$orderby=receivedDateTime desc';
            if ($query !== '') {
                // Prefer $filter for from/to; fall back to $search for free text.
                if (preg_match('/^from:(.+)$/i', $query, $m)) {
                    $email = trim($m[1]);
                    $url .= '&$filter=' . urlencode("from/emailAddress/address eq '{$email}'");
                } elseif (preg_match('/^participants:(.+)$/i', $query, $m)) {
                    $email = trim($m[1]);
                    $url .= '&$search=' . urlencode('"' . $email . '"');
                } else {
                    $url .= '&$search=' . urlencode('"' . $query . '"');
                }
            }
        }

        $response = Http::withToken($accessToken)
            ->timeout(45)
            ->acceptJson()
            ->withHeaders(['ConsistencyLevel' => 'eventual'])
            ->get($url);

        $this->throwIfFailed($response, 'listMessages');

        /** @var array<string,mixed> $data */
        $data = $response->json();

        return [
            'messages' => is_array($data['value'] ?? null) ? $data['value'] : [],
            'nextPageToken' => isset($data['@odata.nextLink']) ? (string) $data['@odata.nextLink'] : null,
        ];
    }

    public function getMessage(EmailAccountDTO $account, string $messageId): array
    {
        $this->assertProvider($account, 'microsoft');
        $this->assertActive($account);

        $accessToken = $this->resolveAccessToken($account);

        $response = Http::withToken($accessToken)
            ->timeout(45)
            ->acceptJson()
            ->get(self::GRAPH_BASE . '/me/messages/' . urlencode($messageId) . '?$expand=attachments');

        $this->throwIfFailed($response, 'getMessage');

        /** @var array<string,mixed> */
        return $response->json();
    }

    public function getThread(EmailAccountDTO $account, string $threadId): array
    {
        $this->assertProvider($account, 'microsoft');
        $this->assertActive($account);

        $accessToken = $this->resolveAccessToken($account);

        $filter = urlencode("conversationId eq '{$threadId}'");
        $response = Http::withToken($accessToken)
            ->timeout(45)
            ->acceptJson()
            ->get(self::GRAPH_BASE . '/me/messages?$filter=' . $filter . '&$orderby=receivedDateTime asc&$top=50');

        $this->throwIfFailed($response, 'getThread');

        /** @var array<string,mixed> $data */
        $data = $response->json();

        return [
            'id' => $threadId,
            'messages' => is_array($data['value'] ?? null) ? $data['value'] : [],
        ];
    }

    public function getAttachment(EmailAccountDTO $account, string $messageId, string $attachmentId): string
    {
        $this->assertProvider($account, 'microsoft');
        $this->assertActive($account);

        $accessToken = $this->resolveAccessToken($account);

        $response = Http::withToken($accessToken)
            ->timeout(60)
            ->acceptJson()
            ->get(self::GRAPH_BASE . '/me/messages/' . urlencode($messageId) . '/attachments/' . urlencode($attachmentId));

        $this->throwIfFailed($response, 'getAttachment');

        /** @var array<string,mixed> $data */
        $data = $response->json();
        $bytes = (string) ($data['contentBytes'] ?? '');

        if ($bytes !== '') {
            return base64_decode($bytes) ?: '';
        }

        // Fallback: /$value endpoint
        $valueResponse = Http::withToken($accessToken)
            ->timeout(60)
            ->get(self::GRAPH_BASE . '/me/messages/' . urlencode($messageId) . '/attachments/' . urlencode($attachmentId) . '/$value');

        $this->throwIfFailed($valueResponse, 'getAttachmentValue');

        return $valueResponse->body();
    }

    public function markAsRead(EmailAccountDTO $account, string $messageId): void
    {
        $this->assertProvider($account, 'microsoft');
        $this->assertActive($account);

        $accessToken = $this->resolveAccessToken($account);

        $response = Http::withToken($accessToken)
            ->timeout(30)
            ->acceptJson()
            ->patch(self::GRAPH_BASE . '/me/messages/' . urlencode($messageId), [
                'isRead' => true,
            ]);

        $this->throwIfFailed($response, 'markAsRead');
    }

    public function trashMessage(EmailAccountDTO $account, string $messageId): void
    {
        $this->assertProvider($account, 'microsoft');
        $this->assertActive($account);

        $accessToken = $this->resolveAccessToken($account);

        $response = Http::withToken($accessToken)
            ->timeout(30)
            ->acceptJson()
            ->post(self::GRAPH_BASE . '/me/messages/' . urlencode($messageId) . '/move', [
                'destinationId' => 'deleteditems',
            ]);

        if ($response->status() === 404) {
            return;
        }

        $this->throwIfFailed($response, 'trashMessage');
    }

    public function listHistory(EmailAccountDTO $account, string $startHistoryId): array
    {
        $this->assertProvider($account, 'microsoft');
        $this->assertActive($account);

        $accessToken = $this->resolveAccessToken($account);

        $url = $startHistoryId !== ''
            ? $startHistoryId
            : self::GRAPH_BASE . '/me/mailFolders/inbox/messages/delta?$top=50';

        $response = Http::withToken($accessToken)
            ->timeout(45)
            ->acceptJson()
            ->get($url);

        $this->throwIfFailed($response, 'listHistory');

        /** @var array<string,mixed> $data */
        $data = $response->json();
        $values = is_array($data['value'] ?? null) ? $data['value'] : [];

        // Normalize to Gmail-like history shape used by CrmEmailService.
        $history = [];
        foreach ($values as $item) {
            if (! is_array($item) || empty($item['id'])) {
                continue;
            }
            // Skip deleted delta markers
            if (isset($item['@removed'])) {
                continue;
            }
            $history[] = [
                'messages' => [['id' => (string) $item['id']]],
            ];
        }

        return [
            'history' => $history,
            'historyId' => isset($data['@odata.deltaLink'])
                ? (string) $data['@odata.deltaLink']
                : (isset($data['@odata.nextLink']) ? (string) $data['@odata.nextLink'] : null),
        ];
    }

    public function getProfile(EmailAccountDTO $account): array
    {
        $this->assertProvider($account, 'microsoft');
        $this->assertActive($account);

        $accessToken = $this->resolveAccessToken($account);

        $response = Http::withToken($accessToken)
            ->timeout(30)
            ->acceptJson()
            ->get(self::GRAPH_BASE . '/me');

        $this->throwIfFailed($response, 'getProfile');

        /** @var array<string,mixed> $profile */
        $profile = $response->json();

        // Seed a delta cursor for first sync.
        $deltaResponse = Http::withToken($accessToken)
            ->timeout(30)
            ->acceptJson()
            ->get(self::GRAPH_BASE . '/me/mailFolders/inbox/messages/delta?$top=1');

        if ($deltaResponse->successful()) {
            /** @var array<string,mixed> $delta */
            $delta = $deltaResponse->json();
            if (isset($delta['@odata.deltaLink'])) {
                $profile['historyId'] = (string) $delta['@odata.deltaLink'];
            }
        }

        return $profile;
    }

    public function testConnection(EmailAccountDTO $account): bool
    {
        $this->assertProvider($account, 'microsoft');

        try {
            $this->getProfile($account);

            return true;
        } catch (\Throwable $e) {
            Log::warning('Microsoft email connection test failed.', [
                'email' => $account->email,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }

    public function parseMessage(array $rawMessage): ParsedEmailDTO
    {
        $from = $rawMessage['from']['emailAddress'] ?? [];
        $toRecipients = array_map(
            fn (array $r): array => ['email' => $r['emailAddress']['address'] ?? '', 'name' => $r['emailAddress']['name'] ?? null],
            is_array($rawMessage['toRecipients'] ?? null) ? $rawMessage['toRecipients'] : [],
        );
        $ccRecipients = array_map(
            fn (array $r): array => ['email' => $r['emailAddress']['address'] ?? '', 'name' => $r['emailAddress']['name'] ?? null],
            is_array($rawMessage['ccRecipients'] ?? null) ? $rawMessage['ccRecipients'] : [],
        );
        $bccRecipients = array_map(
            fn (array $r): array => ['email' => $r['emailAddress']['address'] ?? '', 'name' => $r['emailAddress']['name'] ?? null],
            is_array($rawMessage['bccRecipients'] ?? null) ? $rawMessage['bccRecipients'] : [],
        );

        $body = $rawMessage['body'] ?? [];
        $bodyHtml = ($body['contentType'] ?? '') === 'HTML' ? ($body['content'] ?? null) : null;
        $bodyText = ($body['contentType'] ?? '') === 'Text' ? ($body['content'] ?? null) : null;

        $attachments = [];
        foreach (is_array($rawMessage['attachments'] ?? null) ? $rawMessage['attachments'] : [] as $a) {
            if (! is_array($a) || ($a['isInline'] ?? false) === true) {
                continue;
            }
            $attachments[] = [
                'attachment_id' => (string) ($a['id'] ?? ''),
                'filename' => (string) ($a['name'] ?? 'attachment'),
                'mime_type' => (string) ($a['contentType'] ?? 'application/octet-stream'),
                'size' => (int) ($a['size'] ?? 0),
            ];
        }

        return new ParsedEmailDTO(
            messageId: (string) ($rawMessage['id'] ?? ''),
            threadId: (string) ($rawMessage['conversationId'] ?? ''),
            subject: isset($rawMessage['subject']) ? (string) $rawMessage['subject'] : null,
            fromName: isset($from['name']) ? (string) $from['name'] : null,
            fromEmail: isset($from['address']) ? strtolower((string) $from['address']) : null,
            toRecipients: $toRecipients,
            ccRecipients: $ccRecipients,
            bccRecipients: $bccRecipients,
            bodyHtml: $bodyHtml,
            bodyText: $bodyText,
            isRead: (bool) ($rawMessage['isRead'] ?? false),
            isStarred: false,
            sentAt: isset($rawMessage['receivedDateTime']) ? (string) $rawMessage['receivedDateTime'] : null,
            snippet: isset($rawMessage['bodyPreview']) ? (string) $rawMessage['bodyPreview'] : null,
            attachments: $attachments,
        );
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
                'last_error_message' => 'Microsoft refresh token is missing. Please reconnect.',
                'last_error_at' => now(),
            ]);

            throw ValidationException::withMessages([
                'account' => ['Microsoft account access expired. Please reconnect.'],
            ]);
        }

        $clientId = trim((string) config('services.microsoft_mail.client_id'));
        $clientSecret = trim((string) config('services.microsoft_mail.client_secret'));
        $tenant = trim((string) config('services.microsoft_mail.tenant', 'common'));

        if ($clientId === '' || $clientSecret === '') {
            throw ValidationException::withMessages([
                'integration' => ['Microsoft OAuth is not configured. Contact platform support.'],
            ]);
        }

        $response = Http::asForm()
            ->timeout(30)
            ->post("https://login.microsoftonline.com/{$tenant}/oauth2/v2.0/token", [
                'client_id' => $clientId,
                'client_secret' => $clientSecret,
                'grant_type' => 'refresh_token',
                'refresh_token' => $refreshToken,
                'scope' => implode(' ', config('services.microsoft_mail.scopes', [
                    'openid',
                    'email',
                    'profile',
                    'offline_access',
                    'https://graph.microsoft.com/Mail.ReadWrite',
                    'https://graph.microsoft.com/Mail.Send',
                    'https://graph.microsoft.com/User.Read',
                ])),
            ]);

        if (! $response->successful()) {
            $account->update([
                'status' => 'error',
                'last_error_message' => 'Microsoft token refresh failed.',
                'last_error_at' => now(),
            ]);

            throw ValidationException::withMessages([
                'integration' => ['Microsoft token refresh failed. Please reconnect your account.'],
            ]);
        }

        /** @var array<string,mixed> $payload */
        $payload = $response->json();
        $accessToken = trim((string) ($payload['access_token'] ?? ''));

        if ($accessToken === '') {
            throw ValidationException::withMessages([
                'integration' => ['Microsoft token refresh did not return an access token.'],
            ]);
        }

        $expiresIn = isset($payload['expires_in']) ? max(0, (int) $payload['expires_in']) : 0;
        $newRefresh = isset($payload['refresh_token']) ? trim((string) $payload['refresh_token']) : null;

        $account->update([
            'access_token_encrypted' => $accessToken,
            'refresh_token_encrypted' => $newRefresh !== null && $newRefresh !== '' ? $newRefresh : $account->refresh_token_encrypted,
            'token_expires_at' => $expiresIn > 0 ? now()->addSeconds($expiresIn) : null,
            'last_token_refresh_at' => now(),
            'status' => 'active',
            'last_error_message' => null,
            'last_error_at' => null,
        ]);

        return $accessToken;
    }

    /**
     * @param  list<array{email:string,name?:string}>  $recipients
     * @return list<array{emailAddress:array{address:string,name:string}}>
     */
    private function formatRecipients(array $recipients): array
    {
        return array_map(
            fn (array $r): array => [
                'emailAddress' => [
                    'address' => $r['email'],
                    'name' => $r['name'] ?? '',
                ],
            ],
            $recipients,
        );
    }

    private function throwIfFailed(\Illuminate\Http\Client\Response $response, string $operation): void
    {
        if ($response->status() === 401 || $response->status() === 403) {
            throw ValidationException::withMessages([
                'integration' => ['Microsoft authorization failed. Please reconnect your account.'],
            ]);
        }

        if ($response->status() === 429) {
            throw ValidationException::withMessages([
                'integration' => ['Microsoft rate limit reached. Please try again shortly.'],
            ]);
        }

        if (! $response->successful()) {
            Log::error('Microsoft Graph API request failed.', [
                'operation' => $operation,
                'status' => $response->status(),
                'body' => $response->json() ?? $response->body(),
            ]);

            throw ValidationException::withMessages([
                'integration' => ['Microsoft API error: ' . $response->status()],
            ]);
        }
    }

    private function assertProvider(EmailAccountDTO $account, string $expected): void
    {
        if ($account->provider !== $expected) {
            throw ValidationException::withMessages([
                'provider' => ['Account is not a Microsoft account.'],
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
