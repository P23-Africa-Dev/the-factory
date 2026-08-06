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
        $clientId = $this->clientId();
        $redirectUri = $this->redirectUri();
        $tenant = $this->tenant();

        if ($clientId === '' || $redirectUri === '') {
            throw ValidationException::withMessages([
                'integration' => ['Microsoft 365 email OAuth is not configured yet. Use Google or IMAP/SMTP, or ask platform support to add Microsoft app credentials.'],
            ]);
        }

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

        return [
            'authorization_url' => "https://login.microsoftonline.com/{$tenant}/oauth2/v2.0/authorize?" . $query,
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
        $clientId = $this->clientId();
        $clientSecret = $this->clientSecret();
        $redirectUri = $this->redirectUri();
        $tenant = $this->tenant();

        if ($clientId === '' || $clientSecret === '' || $redirectUri === '') {
            throw ValidationException::withMessages([
                'integration' => ['Microsoft Mail OAuth is not configured. Contact platform support.'],
            ]);
        }

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

    private function nonceCacheKey(string $nonce): string
    {
        return 'microsoft_mail.oauth_nonce.' . $nonce;
    }
}
