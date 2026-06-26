<?php

declare(strict_types=1);

namespace App\Services\Google;

use App\Models\CompanyCalendarConnection;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;

class GoogleTokenService
{
    public function resolveAccessToken(CompanyCalendarConnection $connection): string
    {
        $expiresAt = $connection->token_expires_at;

        if ($expiresAt !== null && $expiresAt->copy()->subSeconds(30)->isFuture()) {
            return (string) $connection->access_token_encrypted;
        }

        return $this->refreshAccessToken($connection);
    }

    public function refreshAccessToken(CompanyCalendarConnection $connection): string
    {
        $clientId = trim((string) config('services.google_calendar.client_id'));
        $clientSecret = trim((string) config('services.google_calendar.client_secret'));

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
            $connection->update([
                'status' => 'error',
                'last_error_message' => 'Google token refresh failed.',
                'last_error_at' => now(),
            ]);

            throw ValidationException::withMessages([
                'integration' => ['Google token refresh failed. Owner reconnection may be required.'],
            ]);
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
