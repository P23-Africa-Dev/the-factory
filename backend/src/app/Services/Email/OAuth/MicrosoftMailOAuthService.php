<?php

declare(strict_types=1);

namespace App\Services\Email\OAuth;

use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class MicrosoftMailOAuthService
{
    public function buildAuthorizationUrl(int $companyId, int $userId, bool $forceAccountPicker = false): array
    {
        $this->assertOAuthConfigured(requireSecret: false);

        $clientId = $this->clientId();
        $redirectUri = $this->redirectUri();
        $tenant = $this->tenant();

        $nonce = (string) Str::uuid();
        $expiresAt = now()->addMinutes(5);

        $state = encrypt([
            'company_id' => $companyId,
            'user_id' => $userId,
            'provider' => 'microsoft',
            'nonce' => $nonce,
            'expires_at' => $expiresAt->toIso8601String(),
        ]);

        Cache::put($this->nonceCacheKey($nonce), [
            'company_id' => $companyId,
            'user_id' => $userId,
            'provider' => 'microsoft',
        ], $expiresAt);

        $query = http_build_query([
            'client_id' => $clientId,
            'response_type' => 'code',
            'redirect_uri' => $redirectUri,
            'response_mode' => 'query',
            'scope' => implode(' ', $this->scopes()),
            'state' => $state,
            'prompt' => $forceAccountPicker ? 'select_account' : 'consent',
        ], '', '&', PHP_QUERY_RFC3986);

        $authorizationUrl = "https://login.microsoftonline.com/{$tenant}/oauth2/v2.0/authorize?" . $query;

        // Guard against PHP http_build_query omitting null/empty client_id (AADSTS900144).
        if (! str_contains($authorizationUrl, 'client_id=' . rawurlencode($clientId))) {
            Log::error('Microsoft Mail authorize URL missing client_id after build.', [
                'tenant' => $tenant,
                'redirect_uri_set' => $redirectUri !== '',
            ]);

            throw ValidationException::withMessages([
                'integration' => [
                    'Microsoft 365 email OAuth is misconfigured (missing client_id). Set MICROSOFT_MAIL_CLIENT_ID in the API secrets and restart the backend.',
                ],
            ]);
        }

        return [
            'authorization_url' => $authorizationUrl,
            'expires_in_seconds' => 300,
        ];
    }

    /**
     * @return array{company_id:int,user_id:int,provider:string,nonce:string,expires_at:string}
     */
    public function consumeState(string $state): array
    {
        try {
            /** @var array<string,mixed> $payload */
            $payload = decrypt($state);
        } catch (DecryptException) {
            throw ValidationException::withMessages([
                'integration' => ['OAuth state is invalid. Please restart the email connection flow.'],
            ]);
        }

        $companyId = isset($payload['company_id']) ? (int) $payload['company_id'] : 0;
        $userId = isset($payload['user_id']) ? (int) $payload['user_id'] : 0;
        $provider = trim((string) ($payload['provider'] ?? ''));
        $nonce = trim((string) ($payload['nonce'] ?? ''));
        $expiresAtRaw = trim((string) ($payload['expires_at'] ?? ''));

        if ($companyId <= 0 || $userId <= 0 || $provider !== 'microsoft' || $nonce === '' || $expiresAtRaw === '') {
            throw ValidationException::withMessages([
                'integration' => ['OAuth state payload is malformed. Please retry connection.'],
            ]);
        }

        try {
            $expiresAt = CarbonImmutable::parse($expiresAtRaw);
        } catch (\Throwable) {
            throw ValidationException::withMessages([
                'integration' => ['OAuth state payload is invalid. Please retry connection.'],
            ]);
        }

        if ($expiresAt->isPast()) {
            throw ValidationException::withMessages([
                'integration' => ['OAuth state has expired. Please start the connection flow again.'],
            ]);
        }

        $cachePayload = Cache::pull($this->nonceCacheKey($nonce));

        if (! is_array($cachePayload)
            || (int) ($cachePayload['company_id'] ?? 0) !== $companyId
            || (int) ($cachePayload['user_id'] ?? 0) !== $userId
            || ($cachePayload['provider'] ?? '') !== 'microsoft') {
            throw ValidationException::withMessages([
                'integration' => ['OAuth state is invalid or has already been used.'],
            ]);
        }

        return [
            'company_id' => $companyId,
            'user_id' => $userId,
            'provider' => 'microsoft',
            'nonce' => $nonce,
            'expires_at' => $expiresAt->toIso8601String(),
        ];
    }

    /**
     * @return array{
     *     access_token:string,
     *     refresh_token:?string,
     *     token_expires_at:?string,
     *     scopes:array<int,string>,
     *     email:string,
     *     display_name:?string
     * }
     */
    public function exchangeCode(string $code): array
    {
        $this->assertOAuthConfigured(requireSecret: true);

        $clientId = $this->clientId();
        $clientSecret = $this->clientSecret();
        $redirectUri = $this->redirectUri();
        $tenant = $this->tenant();

        $tokenResponse = Http::asForm()
            ->timeout(20)
            ->post("https://login.microsoftonline.com/{$tenant}/oauth2/v2.0/token", [
                'client_id' => $clientId,
                'client_secret' => $clientSecret,
                'code' => $code,
                'redirect_uri' => $redirectUri,
                'grant_type' => 'authorization_code',
                'scope' => implode(' ', $this->scopes()),
            ]);

        if (! $tokenResponse->ok()) {
            Log::warning('Microsoft Mail token exchange failed.', [
                'status' => $tokenResponse->status(),
                'body' => $tokenResponse->body(),
            ]);

            $azureError = strtolower((string) ($tokenResponse->json('error') ?? ''));
            $azureDescription = trim((string) ($tokenResponse->json('error_description') ?? ''));

            if (
                str_contains($azureError, 'invalid_client')
                || str_contains(strtolower($azureDescription), 'client secret')
                || str_contains(strtolower($azureDescription), 'invalid_client')
            ) {
                throw ValidationException::withMessages([
                    'integration' => [
                        'Microsoft rejected the app credentials. In Azure App registrations, use the Application (client) ID and the client secret Value (not the Secret ID), then update MICROSOFT_MAIL_CLIENT_ID / MICROSOFT_MAIL_CLIENT_SECRET and restart the backend.',
                    ],
                ]);
            }

            throw ValidationException::withMessages([
                'integration' => ['Microsoft token exchange failed. Please retry the connection process.'],
            ]);
        }

        /** @var array<string,mixed> $tokenPayload */
        $tokenPayload = $tokenResponse->json();
        $accessToken = trim((string) ($tokenPayload['access_token'] ?? ''));

        if ($accessToken === '') {
            throw ValidationException::withMessages([
                'integration' => ['Microsoft token exchange did not return an access token.'],
            ]);
        }

        $profileResponse = Http::withToken($accessToken)
            ->timeout(20)
            ->acceptJson()
            ->get('https://graph.microsoft.com/v1.0/me');

        if (! $profileResponse->ok()) {
            throw ValidationException::withMessages([
                'integration' => ['Unable to load profile from Microsoft. Please retry connection.'],
            ]);
        }

        /** @var array<string,mixed> $profile */
        $profile = $profileResponse->json();
        $email = strtolower(trim((string) ($profile['mail'] ?? $profile['userPrincipalName'] ?? '')));
        $name = trim((string) ($profile['displayName'] ?? ''));

        if ($email === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw ValidationException::withMessages([
                'integration' => ['Microsoft profile did not include a valid email address.'],
            ]);
        }

        $expiresIn = isset($tokenPayload['expires_in']) ? max(0, (int) $tokenPayload['expires_in']) : 0;
        $scopesRaw = trim((string) ($tokenPayload['scope'] ?? ''));
        $scopes = $scopesRaw !== ''
            ? (preg_split('/\s+/', $scopesRaw) ?: [])
            : $this->scopes();

        return [
            'access_token' => $accessToken,
            'refresh_token' => isset($tokenPayload['refresh_token']) ? trim((string) $tokenPayload['refresh_token']) : null,
            'token_expires_at' => $expiresIn > 0 ? now()->addSeconds($expiresIn)->toIso8601String() : null,
            'scopes' => array_values(array_filter(array_map(
                static fn (mixed $scope): string => trim((string) $scope),
                $scopes,
            ))),
            'email' => $email,
            'display_name' => $name !== '' ? $name : null,
        ];
    }

    /**
     * @return list<string>
     */
    public function scopes(): array
    {
        $scopes = config('services.microsoft_mail.scopes', []);

        if (! is_array($scopes) || $scopes === []) {
            return [
                'openid',
                'email',
                'profile',
                'offline_access',
                'https://graph.microsoft.com/Mail.ReadWrite',
                'https://graph.microsoft.com/Mail.Send',
                'https://graph.microsoft.com/User.Read',
            ];
        }

        return array_values(array_filter(array_map(
            static fn (mixed $scope): string => trim((string) $scope),
            $scopes,
        )));
    }

    private function clientId(): string
    {
        return trim((string) config('services.microsoft_mail.client_id'));
    }

    private function clientSecret(): string
    {
        return trim((string) config('services.microsoft_mail.client_secret'));
    }

    private function redirectUri(): string
    {
        return trim((string) config('services.microsoft_mail.redirect_uri'));
    }

    private function tenant(): string
    {
        $tenant = trim((string) config('services.microsoft_mail.tenant', 'common'));

        return $tenant !== '' ? $tenant : 'common';
    }

    private function assertOAuthConfigured(bool $requireSecret): void
    {
        $clientId = $this->clientId();
        $redirectUri = $this->redirectUri();
        $clientSecret = $this->clientSecret();

        if ($clientId === '' || $redirectUri === '' || ($requireSecret && $clientSecret === '')) {
            throw ValidationException::withMessages([
                'integration' => [
                    'Microsoft 365 email OAuth is not configured on the API. Set MICROSOFT_MAIL_CLIENT_ID and MICROSOFT_MAIL_CLIENT_SECRET in factory23-secret, apply the secret, restart the backend, then retry. Prefer Google meanwhile.',
                ],
            ]);
        }

        // Application (client) ID from Azure is a GUID.
        if (! preg_match('/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/', $clientId)) {
            throw ValidationException::withMessages([
                'integration' => [
                    'MICROSOFT_MAIL_CLIENT_ID must be the Azure Application (client) ID (a GUID). Check App registrations → Overview.',
                ],
            ]);
        }

        // Secret ID is also a GUID; the Value is a longer opaque string. Using the ID causes later auth failures.
        if (
            $requireSecret
            && preg_match('/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/', $clientSecret)
        ) {
            throw ValidationException::withMessages([
                'integration' => [
                    'MICROSOFT_MAIL_CLIENT_SECRET looks like a Secret ID. Paste the client secret Value from Certificates & secrets (shown only once when created), not the Secret ID.',
                ],
            ]);
        }
    }

    private function nonceCacheKey(string $nonce): string
    {
        return 'microsoft_mail.oauth_nonce.' . $nonce;
    }
}
