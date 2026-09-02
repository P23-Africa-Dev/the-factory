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

class GoogleMailOAuthService
{
    public function buildAuthorizationUrl(int $companyId, int $userId, bool $forceAccountPicker = false): array
    {
        $clientId = $this->clientId();
        $redirectUri = $this->redirectUri();

        if ($clientId === '' || $redirectUri === '') {
            throw ValidationException::withMessages([
                'integration' => ['Google Mail OAuth is not configured. Contact platform support.'],
            ]);
        }

        $nonce = (string) Str::uuid();
        $expiresAt = now()->addMinutes(5);

        $state = encrypt([
            'company_id' => $companyId,
            'user_id' => $userId,
            'provider' => 'google',
            'flow' => 'email_account',
            'nonce' => $nonce,
            'expires_at' => $expiresAt->toIso8601String(),
        ]);

        Cache::put($this->nonceCacheKey($nonce), [
            'company_id' => $companyId,
            'user_id' => $userId,
            'provider' => 'google',
            'flow' => 'email_account',
        ], $expiresAt);

        $query = http_build_query([
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => implode(' ', $this->scopes()),
            'access_type' => 'offline',
            // Keep Gmail consent isolated from any Calendar grant made with the
            // same Google OAuth client.
            'include_granted_scopes' => 'false',
            'prompt' => $forceAccountPicker ? 'select_account consent' : 'consent',
            'state' => $state,
        ], '', '&', PHP_QUERY_RFC3986);

        return [
            'authorization_url' => 'https://accounts.google.com/o/oauth2/v2/auth?' . $query,
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

        if ($companyId <= 0 || $userId <= 0 || $provider !== 'google' || $nonce === '' || $expiresAtRaw === '') {
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

        if (! is_array($cachePayload)) {
            throw ValidationException::withMessages([
                'integration' => ['OAuth state is invalid or has already been used.'],
            ]);
        }

        if ((int) ($cachePayload['company_id'] ?? 0) !== $companyId
            || (int) ($cachePayload['user_id'] ?? 0) !== $userId
            || ($cachePayload['provider'] ?? '') !== 'google') {
            throw ValidationException::withMessages([
                'integration' => ['OAuth state does not match the original request context.'],
            ]);
        }

        return [
            'company_id' => $companyId,
            'user_id' => $userId,
            'provider' => 'google',
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

        if ($clientId === '' || $clientSecret === '' || $redirectUri === '') {
            throw ValidationException::withMessages([
                'integration' => ['Google Mail OAuth is not configured. Contact platform support.'],
            ]);
        }

        $tokenResponse = Http::asForm()
            ->timeout(20)
            ->post('https://oauth2.googleapis.com/token', [
                'code' => $code,
                'client_id' => $clientId,
                'client_secret' => $clientSecret,
                'redirect_uri' => $redirectUri,
                'grant_type' => 'authorization_code',
            ]);

        if (! $tokenResponse->ok()) {
            Log::warning('Google Mail token exchange failed.', [
                'status' => $tokenResponse->status(),
                'body' => $tokenResponse->body(),
            ]);

            throw ValidationException::withMessages([
                'integration' => ['Google token exchange failed. Please retry the connection process.'],
            ]);
        }

        /** @var array<string,mixed> $tokenPayload */
        $tokenPayload = $tokenResponse->json();
        $accessToken = trim((string) ($tokenPayload['access_token'] ?? ''));

        if ($accessToken === '') {
            throw ValidationException::withMessages([
                'integration' => ['Google token exchange did not return an access token.'],
            ]);
        }

        $profileResponse = Http::withToken($accessToken)
            ->timeout(20)
            ->get('https://www.googleapis.com/oauth2/v3/userinfo');

        if (! $profileResponse->ok()) {
            throw ValidationException::withMessages([
                'integration' => ['Unable to load profile from Google. Please retry connection.'],
            ]);
        }

        /** @var array<string,mixed> $profile */
        $profile = $profileResponse->json();
        $email = strtolower(trim((string) ($profile['email'] ?? '')));
        $name = trim((string) ($profile['name'] ?? ''));

        if ($email === '') {
            throw ValidationException::withMessages([
                'integration' => ['Google profile did not include an email address.'],
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
        $scopes = config('services.google_mail.scopes', []);

        if (! is_array($scopes) || $scopes === []) {
            return [
                'openid',
                'email',
                'profile',
                'https://www.googleapis.com/auth/gmail.send',
                'https://www.googleapis.com/auth/gmail.modify',
            ];
        }

        return array_values(array_filter(array_map(
            static fn (mixed $scope): string => trim((string) $scope),
            $scopes,
        )));
    }

    private function clientId(): string
    {
        return trim((string) (
            config('services.google_mail.client_id')
            ?: config('services.google_calendar.client_id')
        ));
    }

    private function clientSecret(): string
    {
        return trim((string) (
            config('services.google_mail.client_secret')
            ?: config('services.google_calendar.client_secret')
        ));
    }

    private function redirectUri(): string
    {
        return trim((string) config('services.google_mail.redirect_uri'));
    }

    private function nonceCacheKey(string $nonce): string
    {
        return 'google_mail.oauth_nonce.' . $nonce;
    }
}
