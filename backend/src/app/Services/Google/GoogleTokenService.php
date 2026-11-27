<?php

declare(strict_types=1);

namespace App\Services\Google;

use App\Models\CompanyCalendarConnection;
use App\Models\UserCalendarConnection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class GoogleTokenService
{
    /**
     * @param  CompanyCalendarConnection|UserCalendarConnection|EmailAccountGmailConnection  $connection
     */
    public function resolveAccessToken(CompanyCalendarConnection|UserCalendarConnection|EmailAccountGmailConnection $connection): string
    {
        $expiresAt = $connection->token_expires_at;

        if ($expiresAt !== null && $expiresAt->copy()->subSeconds(30)->isFuture()) {
            return (string) $connection->access_token_encrypted;
        }

        return $this->refreshAccessToken($connection);
    }

    /**
     * @param  CompanyCalendarConnection|UserCalendarConnection|EmailAccountGmailConnection  $connection
     */
    public function refreshAccessToken(CompanyCalendarConnection|UserCalendarConnection|EmailAccountGmailConnection $connection): string
    {
        $clientId = trim((string) (
            config('services.google_mail.client_id')
            ?: config('services.google_calendar.client_id')
        ));
        $clientSecret = trim((string) (
            config('services.google_mail.client_secret')
            ?: config('services.google_calendar.client_secret')
        ));

        if ($clientId === '' || $clientSecret === '') {
            throw ValidationException::withMessages([
                'integration' => ['Google credentials are not configured.'],
            ]);
        }

        $response = Http::asForm()
            ->timeout(30)
            ->post('https://oauth2.googleapis.com/token', [
                'client_id' => $clientId,
                'client_secret' => $clientSecret,
                'grant_type' => 'refresh_token',
                'refresh_token' => (string) $connection->refresh_token_encrypted,
            ]);

        if (! $response->successful()) {
            $googleError = trim((string) ($response->json('error') ?? ''));

            Log::warning('Google token refresh failed.', [
                'connection' => $connection::class,
                'status' => $response->status(),
                'google_error' => $googleError !== '' ? $googleError : null,
                'google_error_description' => $response->json('error_description'),
            ]);

            // Only a rejected grant/client needs the user to reconnect. A Google
            // outage or timeout (5xx, 429) must not park the account in "error",
            // because the scheduled sync never retries accounts in that state.
            $permanent = in_array($response->status(), [400, 401], true)
                && in_array($googleError, ['invalid_grant', 'invalid_client', 'unauthorized_client', 'invalid_scope'], true);

            if ($permanent) {
                $connection->update([
                    'status' => 'error',
                    'last_error_message' => 'Google token refresh failed (' . $googleError . ').',
                    'last_error_at' => now(),
                ]);

                throw ValidationException::withMessages([
                    'integration' => ['Google token refresh failed. Owner reconnection may be required.'],
                ]);
            }

            throw new \RuntimeException('Google token refresh temporarily failed (HTTP ' . $response->status() . '). Will retry.');
        }

        /** @var array<string,mixed> $payload */
        $payload = $response->json();
        $newAccessToken = trim((string) ($payload['access_token'] ?? ''));

        if ($newAccessToken === '') {
            throw ValidationException::withMessages([
                'integration' => ['Google token refresh did not return an access token.'],
            ]);
        }

        $expiresIn = isset($payload['expires_in']) ? max(0, (int) $payload['expires_in']) : 0;

        $connection->update([
            'access_token_encrypted' => $newAccessToken,
            'token_expires_at' => $expiresIn > 0 ? now()->addSeconds($expiresIn) : null,
            'last_token_refresh_at' => now(),
            'status' => 'active',
            'last_error_message' => null,
            'last_error_at' => null,
        ]);

        return $newAccessToken;
    }
}
