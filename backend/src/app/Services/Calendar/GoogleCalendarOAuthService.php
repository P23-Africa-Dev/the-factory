<?php

declare(strict_types=1);

namespace App\Services\Calendar;

use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class GoogleCalendarOAuthService
{
    public function buildAuthorizationUrl(int $companyId, int $userId): array
    {
        $clientId = trim((string) config('services.google_calendar.client_id'));
        $redirectUri = trim((string) config('services.google_calendar.redirect_uri'));

        if ($clientId === '' || $redirectUri === '') {
            throw ValidationException::withMessages([
                'integration' => ['Google Calendar OAuth is not configured. Contact platform support.'],
            ]);
        }

        $nonce = (string) Str::uuid();
        $expiresAt = now()->addMinutes(5);

        $state = encrypt([
            'company_id' => $companyId,
            'user_id' => $userId,
            'nonce' => $nonce,
            'expires_at' => $expiresAt->toIso8601String(),
        ]);

        Cache::put($this->nonceCacheKey($nonce), [
            'company_id' => $companyId,
            'user_id' => $userId,
        ], $expiresAt);

        $query = http_build_query([
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => implode(' ', $this->scopes()),
            'access_type' => 'offline',
            'include_granted_scopes' => 'true',
            'prompt' => 'consent',
            'state' => $state,
        ], '', '&', PHP_QUERY_RFC3986);

        return [
            'authorization_url' => 'https://accounts.google.com/o/oauth2/v2/auth?' . $query,
            'expires_in_seconds' => 300,
        ];
    }

    /**
     * @return array{company_id:int,user_id:int,nonce:string,expires_at:string}
     */
    public function consumeState(string $state): array
    {
        try {
            /** @var array<string,mixed> $payload */
            $payload = decrypt($state);
        } catch (DecryptException) {
            throw ValidationException::withMessages([
                'integration' => ['OAuth state is invalid. Please restart the Google Calendar connection flow.'],
            ]);
        }

        $companyId = isset($payload['company_id']) ? (int) $payload['company_id'] : 0;
        $userId = isset($payload['user_id']) ? (int) $payload['user_id'] : 0;
        $nonce = trim((string) ($payload['nonce'] ?? ''));
        $expiresAtRaw = trim((string) ($payload['expires_at'] ?? ''));

        if ($companyId <= 0 || $userId <= 0 || $nonce === '' || $expiresAtRaw === '') {
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

        $cachedCompanyId = isset($cachePayload['company_id']) ? (int) $cachePayload['company_id'] : 0;
        $cachedUserId = isset($cachePayload['user_id']) ? (int) $cachePayload['user_id'] : 0;

        if ($cachedCompanyId !== $companyId || $cachedUserId !== $userId) {
            throw ValidationException::withMessages([
                'integration' => ['OAuth state does not match the original request context.'],
            ]);
        }

        return [
            'company_id' => $companyId,
            'user_id' => $userId,
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
     *     organizer_email:string,
     *     organizer_google_user_id:string
     * }
     */
    public function exchangeCodeForOrganizer(string $code): array
    {
        $clientId = trim((string) config('services.google_calendar.client_id'));
        $clientSecret = trim((string) config('services.google_calendar.client_secret'));
        $redirectUri = trim((string) config('services.google_calendar.redirect_uri'));

        if ($clientId === '' || $clientSecret === '' || $redirectUri === '') {
            throw ValidationException::withMessages([
                'integration' => ['Google Calendar OAuth is not configured. Contact platform support.'],
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
                'integration' => ['Unable to load organizer profile from Google. Please retry connection.'],
            ]);
        }

        /** @var array<string,mixed> $profilePayload */
        $profilePayload = $profileResponse->json();
        $organizerEmail = trim((string) ($profilePayload['email'] ?? ''));
        $organizerGoogleUserId = trim((string) ($profilePayload['sub'] ?? ''));

        if ($organizerEmail === '' || $organizerGoogleUserId === '') {
            throw ValidationException::withMessages([
                'integration' => ['Organizer profile from Google is incomplete. Please retry connection.'],
            ]);
        }

        $expiresInSeconds = isset($tokenPayload['expires_in']) ? max(0, (int) $tokenPayload['expires_in']) : 0;
        $tokenExpiresAt = $expiresInSeconds > 0
            ? now()->addSeconds($expiresInSeconds)->toIso8601String()
            : null;

        $scopesRaw = trim((string) ($tokenPayload['scope'] ?? ''));
        $scopes = $scopesRaw !== ''
            ? preg_split('/\s+/', $scopesRaw) ?: []
            : $this->scopes();

        return [
            'access_token' => $accessToken,
            'refresh_token' => isset($tokenPayload['refresh_token']) ? trim((string) $tokenPayload['refresh_token']) : null,
            'token_expires_at' => $tokenExpiresAt,
            'scopes' => array_values(array_filter(array_map(
                static fn(mixed $scope): string => trim((string) $scope),
                $scopes,
            ))),
            'organizer_email' => $organizerEmail,
            'organizer_google_user_id' => $organizerGoogleUserId,
        ];
    }

    private function scopes(): array
    {
        $scopes = config('services.google_calendar.scopes', []);

        if (! is_array($scopes) || $scopes === []) {
            return [
                'https://www.googleapis.com/auth/calendar',
                'https://www.googleapis.com/auth/calendar.events',
            ];
        }

        return array_values(array_filter(array_map(
            static fn(mixed $scope): string => trim((string) $scope),
            $scopes,
        )));
    }

    private function nonceCacheKey(string $nonce): string
    {
        return 'google_calendar.oauth_nonce.' . $nonce;
    }
}
