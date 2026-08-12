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

class ZohoMailOAuthService
{
    public function buildAuthorizationUrl(int $companyId, int $userId, bool $forceAccountPicker = false): array
    {
        $clientId = $this->clientId();
        $redirectUri = $this->redirectUri();

        if ($clientId === '' || $redirectUri === '') {
            throw ValidationException::withMessages([
                'integration' => ['Zoho Mail OAuth is not configured yet. Use Google or IMAP/SMTP, or ask platform support to add Zoho app credentials.'],
            ]);
        }

        $nonce = (string) Str::uuid();
        $expiresAt = now()->addMinutes(5);

        $state = encrypt([
            'company_id' => $companyId,
            'user_id' => $userId,
            'provider' => 'zoho',
            'nonce' => $nonce,
            'expires_at' => $expiresAt->toIso8601String(),
        ]);

        Cache::put($this->nonceCacheKey($nonce), [
            'company_id' => $companyId,
            'user_id' => $userId,
            'provider' => 'zoho',
        ], $expiresAt);

        $query = http_build_query([
            'client_id' => $clientId,
            'response_type' => 'code',
            'redirect_uri' => $redirectUri,
            'scope' => implode(',', $this->scopes()),
            'access_type' => 'offline',
            'prompt' => $forceAccountPicker ? 'consent' : 'consent',
            'state' => $state,
        ], '', '&', PHP_QUERY_RFC3986);

        return [
            'authorization_url' => $this->accountsBase() . '/oauth/v2/auth?' . $query,
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

        if ($companyId <= 0 || $userId <= 0 || $provider !== 'zoho' || $nonce === '' || $expiresAtRaw === '') {
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
            || ($cachePayload['provider'] ?? '') !== 'zoho') {
            throw ValidationException::withMessages([
                'integration' => ['OAuth state is invalid or has already been used.'],
            ]);
        }

        return [
            'company_id' => $companyId,
            'user_id' => $userId,
            'provider' => 'zoho',
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
     *     display_name:?string,
     *     provider_metadata:array<string,mixed>
     * }
     */
    public function exchangeCode(string $code): array
    {
        $clientId = $this->clientId();
        $clientSecret = $this->clientSecret();
        $redirectUri = $this->redirectUri();

        if ($clientId === '' || $clientSecret === '' || $redirectUri === '') {
            throw ValidationException::withMessages([
                'integration' => ['Zoho Mail OAuth is not configured. Contact platform support.'],
            ]);
        }

        $tokenResponse = Http::asForm()
            ->timeout(20)
            ->post($this->accountsBase() . '/oauth/v2/token', [
                'code' => $code,
                'client_id' => $clientId,
                'client_secret' => $clientSecret,
                'redirect_uri' => $redirectUri,
                'grant_type' => 'authorization_code',
            ]);

        if (! $tokenResponse->ok()) {
            Log::warning('Zoho Mail token exchange failed.', [
                'status' => $tokenResponse->status(),
                'body' => $tokenResponse->body(),
            ]);

            throw ValidationException::withMessages([
                'integration' => ['Zoho token exchange failed. Please retry the connection process.'],
            ]);
        }

        /** @var array<string,mixed> $tokenPayload */
        $tokenPayload = $tokenResponse->json();
        $accessToken = trim((string) ($tokenPayload['access_token'] ?? ''));

        if ($accessToken === '') {
            throw ValidationException::withMessages([
                'integration' => ['Zoho token exchange did not return an access token.'],
            ]);
        }

        $accountsResponse = Http::withToken($accessToken)
            ->timeout(20)
            ->acceptJson()
            ->get($this->mailApiBase() . '/accounts');

        if (! $accountsResponse->ok()) {
            throw ValidationException::withMessages([
                'integration' => ['Unable to load Zoho Mail accounts. Please retry connection.'],
            ]);
        }

        /** @var array<string,mixed> $accountsPayload */
        $accountsPayload = $accountsResponse->json();
        $accounts = is_array($accountsPayload['data'] ?? null) ? $accountsPayload['data'] : [];
        $first = is_array($accounts[0] ?? null) ? $accounts[0] : [];

        $email = strtolower(trim((string) ($first['primaryEmailAddress'] ?? $first['emailAddress'] ?? '')));
        $name = trim((string) ($first['displayName'] ?? $first['accountName'] ?? ''));
        $zohoAccountId = (string) ($first['accountId'] ?? '');

        if ($email === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw ValidationException::withMessages([
                'integration' => ['Zoho profile did not include a valid email address.'],
            ]);
        }

        $expiresIn = isset($tokenPayload['expires_in']) ? max(0, (int) $tokenPayload['expires_in']) : 3600;

        return [
            'access_token' => $accessToken,
            'refresh_token' => isset($tokenPayload['refresh_token']) ? trim((string) $tokenPayload['refresh_token']) : null,
            'token_expires_at' => now()->addSeconds($expiresIn)->toIso8601String(),
            'scopes' => $this->scopes(),
            'email' => $email,
            'display_name' => $name !== '' ? $name : null,
            'provider_metadata' => array_filter([
                'zoho_account_id' => $zohoAccountId !== '' ? $zohoAccountId : null,
            ]),
        ];
    }

    /**
     * @return list<string>
     */
    public function scopes(): array
    {
        $scopes = config('services.zoho_mail.scopes', []);

        if (! is_array($scopes) || $scopes === []) {
            return [
                'ZohoMail.messages.ALL',
                'ZohoMail.accounts.READ',
            ];
        }

        return array_values(array_filter(array_map(
            static fn (mixed $scope): string => trim((string) $scope),
            $scopes,
        )));
    }

    private function clientId(): string
    {
        return trim((string) config('services.zoho_mail.client_id'));
    }

    private function clientSecret(): string
    {
        return trim((string) config('services.zoho_mail.client_secret'));
    }

    private function redirectUri(): string
    {
        return trim((string) config('services.zoho_mail.redirect_uri'));
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

    private function mailApiBase(): string
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

    private function nonceCacheKey(string $nonce): string
    {
        return 'zoho_mail.oauth_nonce.' . $nonce;
    }
}
