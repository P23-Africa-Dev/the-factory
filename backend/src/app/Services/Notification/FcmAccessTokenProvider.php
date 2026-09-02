<?php

declare(strict_types=1);

namespace App\Services\Notification;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Fetches short-lived OAuth tokens for Firebase Cloud Messaging HTTP v1
 * using a Google service-account JSON (Firebase Admin SDK key).
 */
class FcmAccessTokenProvider
{
    private const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

    private const TOKEN_URI = 'https://oauth2.googleapis.com/token';

    private const CACHE_KEY = 'fcm_http_v1_access_token';

    /**
     * @return array{access_token: string, project_id: string}
     */
    public function tokenAndProject(): array
    {
        $credentials = $this->loadCredentials();
        $projectId = (string) (
            config('services.fcm.project_id')
            ?: ($credentials['project_id'] ?? '')
        );

        if ($projectId === '') {
            throw new RuntimeException('FCM project_id is not configured.');
        }

        $cached = Cache::get(self::CACHE_KEY);
        if (is_string($cached) && $cached !== '') {
            return [
                'access_token' => $cached,
                'project_id' => $projectId,
            ];
        }

        $assertion = $this->buildJwtAssertion($credentials);
        $response = Http::asForm()->post(self::TOKEN_URI, [
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $assertion,
        ]);

        if (! $response->successful()) {
            throw new RuntimeException(
                'Failed to exchange FCM service-account JWT for access token: '.$response->body()
            );
        }

        $accessToken = (string) ($response->json('access_token') ?? '');
        if ($accessToken === '') {
            throw new RuntimeException('FCM OAuth response did not include access_token.');
        }

        $expiresIn = (int) ($response->json('expires_in') ?? 3600);
        Cache::put(self::CACHE_KEY, $accessToken, max(60, $expiresIn - 120));

        return [
            'access_token' => $accessToken,
            'project_id' => $projectId,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function loadCredentials(): array
    {
        $path = (string) config('services.fcm.service_account_path', '');
        if ($path !== '' && is_readable($path)) {
            $raw = file_get_contents($path);
            if ($raw === false) {
                throw new RuntimeException('Unable to read FCM_SERVICE_ACCOUNT_PATH.');
            }

            return $this->decodeCredentials($raw);
        }

        $json = (string) config('services.fcm.service_account_json', '');
        if ($json !== '') {
            return $this->decodeCredentials($json);
        }

        throw new RuntimeException(
            'FCM service account is not configured. Set FCM_SERVICE_ACCOUNT_JSON or FCM_SERVICE_ACCOUNT_PATH.'
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function decodeCredentials(string $raw): array
    {
        $trimmed = trim($raw);
        // Allow base64-encoded JSON for single-line k8s secrets.
        if ($trimmed !== '' && $trimmed[0] !== '{') {
            $decoded = base64_decode($trimmed, true);
            if (is_string($decoded) && $decoded !== '') {
                $trimmed = $decoded;
            }
        }

        /** @var mixed $data */
        $data = json_decode($trimmed, true);
        if (! is_array($data)) {
            throw new RuntimeException('FCM service account JSON is invalid.');
        }

        if (empty($data['client_email']) || empty($data['private_key'])) {
            throw new RuntimeException('FCM service account JSON is missing client_email or private_key.');
        }

        return $data;
    }

    /**
     * @param  array<string, mixed>  $credentials
     */
    private function buildJwtAssertion(array $credentials): string
    {
        $now = time();
        $header = ['alg' => 'RS256', 'typ' => 'JWT'];
        $payload = [
            'iss' => (string) $credentials['client_email'],
            'scope' => self::SCOPE,
            'aud' => self::TOKEN_URI,
            'iat' => $now,
            'exp' => $now + 3600,
        ];

        $segments = [
            $this->base64UrlEncode(json_encode($header, JSON_THROW_ON_ERROR)),
            $this->base64UrlEncode(json_encode($payload, JSON_THROW_ON_ERROR)),
        ];
        $signingInput = implode('.', $segments);

        $privateKey = openssl_pkey_get_private((string) $credentials['private_key']);
        if ($privateKey === false) {
            throw new RuntimeException('Unable to parse FCM service-account private_key.');
        }

        $signature = '';
        $ok = openssl_sign($signingInput, $signature, $privateKey, OPENSSL_ALGO_SHA256);
        if (! $ok) {
            throw new RuntimeException('Failed to sign FCM service-account JWT.');
        }

        $segments[] = $this->base64UrlEncode($signature);

        return implode('.', $segments);
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
