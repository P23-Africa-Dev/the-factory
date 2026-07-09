<?php

declare(strict_types=1);

namespace App\Services\Calendar;

use App\Models\CompanyCalendarConnection;
use App\Models\User;
use App\Services\Company\CompanyContextService;
use App\Services\Google\GoogleScopeHelper;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CompanyCalendarConnectionService
{
    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly GoogleCalendarOAuthService $oauthService,
    ) {}

    public function status(User $user, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $role = (string) $context['role'];

        $this->ensureCanViewIntegration($role);

        $resolvedCompanyId = (int) $context['company']->id;
        $connection = CompanyCalendarConnection::query()
            ->where('company_id', $resolvedCompanyId)
            ->first();

        $connected = $connection !== null
            && $connection->status === 'active'
            && $connection->disconnected_at === null;

        $tokenValid = $connected && $this->isTokenValid($connection);

        $healthStatus = 'not_connected';
        if ($connected) {
            if (! $tokenValid || $connection?->status === 'error') {
                $healthStatus = 'requires_reauthentication';
            } elseif (trim((string) $connection?->last_error_message) !== '') {
                $healthStatus = 'degraded';
            } else {
                $healthStatus = 'healthy';
            }
        }

        $gmailEnabled = $connected && GoogleScopeHelper::connectionHasGmailScopes($connection);
        $requiresGmailReconnect = $connected && ! $gmailEnabled;

        return [
            'connected' => $connected,
            'status' => $connection?->status ?? 'not_connected',
            'connected_google_email' => $connection?->organizer_email,
            'organizer_email' => $connection?->organizer_email,
            'google_account_name' => $connection?->organizer_name,
            'owner_user_id' => $connection?->owner_user_id,
            'requires_owner_action' => ! $connected,
            'can_manage_connection' => in_array($role, ['owner', 'admin'], true),
            'token_valid' => $tokenValid,
            'requires_reauthentication' => $connected && ! $tokenValid,
            'gmail_enabled' => $gmailEnabled,
            'requires_gmail_reconnect' => $requiresGmailReconnect,
            'gmail_last_synced_at' => $connection?->gmail_last_synced_at?->toIso8601String(),
            'connection_health_status' => $healthStatus,
            'last_error_message' => $connection?->last_error_message,
            'last_token_refresh_at' => $connection?->last_token_refresh_at?->toIso8601String(),
            'connection_date' => $connection?->connected_at?->toIso8601String(),
            'connected_at' => $connection?->connected_at?->toIso8601String(),
            'disconnected_at' => $connection?->disconnected_at?->toIso8601String(),
        ];
    }

    public function createConnectUrl(User $user, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $role = (string) $context['role'];

        $this->ensureCalendarAdmin($role);

        $resolvedCompanyId = (int) $context['company']->id;

        return $this->oauthService->buildAuthorizationUrl($resolvedCompanyId, (int) $user->id, 'company', true);
    }

    public function disconnect(User $user, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $role = (string) $context['role'];

        $this->ensureCalendarAdmin($role);

        $resolvedCompanyId = (int) $context['company']->id;
        $connection = CompanyCalendarConnection::query()
            ->where('company_id', $resolvedCompanyId)
            ->first();

        if (! $connection) {
            return ['disconnected' => false];
        }

        $revocation = $this->oauthService->revokeTokens(
            accessToken: (string) $connection->access_token_encrypted,
            refreshToken: (string) $connection->refresh_token_encrypted,
        );

        $connection->update([
            'status' => 'revoked',
            'access_token_encrypted' => '',
            'refresh_token_encrypted' => '',
            'token_expires_at' => null,
            'last_token_refresh_at' => null,
            'scopes' => [],
            'last_error_message' => null,
            'last_error_at' => null,
            'disconnected_at' => now(),
        ]);

        return [
            'disconnected' => true,
            'access_token_revoked' => $revocation['access_token_revoked'],
            'refresh_token_revoked' => $revocation['refresh_token_revoked'],
        ];
    }

    public function switchAccountConnectUrl(User $user, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $role = (string) $context['role'];

        $this->ensureCalendarAdmin($role);

        $resolvedCompanyId = (int) $context['company']->id;

        $existing = CompanyCalendarConnection::query()
            ->where('company_id', $resolvedCompanyId)
            ->first();

        if ($existing) {
            $this->disconnect($user, $resolvedCompanyId);
        }

        return $this->oauthService->buildAuthorizationUrl($resolvedCompanyId, (int) $user->id);
    }

    public function reconnectUrl(User $user, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $role = (string) $context['role'];

        $this->ensureCalendarAdmin($role);

        $resolvedCompanyId = (int) $context['company']->id;

        return $this->oauthService->buildAuthorizationUrl($resolvedCompanyId, (int) $user->id);
    }

    public function completeCallback(string $code, string $state): array
    {
        $statePayload = $this->oauthService->consumeState($state);
        $companyId = (int) $statePayload['company_id'];
        $userId = (int) $statePayload['user_id'];

        $owner = User::query()->find($userId);

        if (! $owner) {
            throw ValidationException::withMessages([
                'integration' => ['OAuth owner context is invalid. Please restart connection from your dashboard.'],
            ]);
        }

        $this->ensureUserIsCalendarAdminForCompany($userId, $companyId);

        $exchangePayload = $this->oauthService->exchangeCodeForOrganizer($code);

        $connection = CompanyCalendarConnection::query()
            ->where('company_id', $companyId)
            ->first();

        $refreshToken = trim((string) ($exchangePayload['refresh_token'] ?? ''));

        if ($refreshToken === '' && $connection) {
            $refreshToken = trim((string) $connection->refresh_token_encrypted);
        }

        if ($refreshToken === '') {
            throw ValidationException::withMessages([
                'integration' => ['Google did not return a refresh token. Please reconnect and grant consent again.'],
            ]);
        }

        $connection = CompanyCalendarConnection::query()->updateOrCreate(
            ['company_id' => $companyId],
            [
                'owner_user_id' => $userId,
                'organizer_email' => (string) $exchangePayload['organizer_email'],
                'organizer_name' => isset($exchangePayload['organizer_name']) ? (string) $exchangePayload['organizer_name'] : null,
                'organizer_google_user_id' => (string) $exchangePayload['organizer_google_user_id'],
                'access_token_encrypted' => (string) $exchangePayload['access_token'],
                'refresh_token_encrypted' => $refreshToken,
                'token_expires_at' => $exchangePayload['token_expires_at'] ?? null,
                'last_token_refresh_at' => null,
                'scopes' => $exchangePayload['scopes'] ?? [],
                'status' => 'active',
                'last_error_message' => null,
                'last_error_at' => null,
                'connected_at' => now(),
                'disconnected_at' => null,
            ]
        );

        $connection->refresh();

        $gmailEnabled = GoogleScopeHelper::connectionHasGmailScopes($connection);

        return [
            'connected' => true,
            'status' => 'active',
            'organizer_email' => $connection->organizer_email,
            'google_account_name' => $connection->organizer_name,
            'owner_user_id' => $connection->owner_user_id,
            'requires_owner_action' => false,
            'token_valid' => $this->isTokenValid($connection),
            'requires_reauthentication' => false,
            'gmail_enabled' => $gmailEnabled,
            'requires_gmail_reconnect' => ! $gmailEnabled,
            'connection_health_status' => 'healthy',
            'last_error_message' => null,
            'last_token_refresh_at' => $connection->last_token_refresh_at?->toIso8601String(),
            'connection_date' => $connection->connected_at?->toIso8601String(),
            'connected_at' => $connection->connected_at?->toIso8601String(),
            'disconnected_at' => null,
        ];
    }

    private function isTokenValid(?CompanyCalendarConnection $connection): bool
    {
        if ($connection === null || $connection->status !== 'active' || $connection->disconnected_at !== null) {
            return false;
        }

        $accessToken = trim((string) $connection->access_token_encrypted);
        if ($accessToken === '') {
            return false;
        }

        /** @var Carbon|null $expiresAt */
        $expiresAt = $connection->token_expires_at;

        return $expiresAt === null || $expiresAt->isFuture();
    }

    private function ensureCanViewIntegration(string $role): void
    {
        if (in_array($role, ['owner', 'admin', 'supervisor', 'agent'], true)) {
            return;
        }

        throw ValidationException::withMessages([
            'authorization' => ['Only company members can view calendar integration status.'],
        ]);
    }

    private function ensureCalendarAdmin(string $role): void
    {
        if (in_array($role, ['owner', 'admin'], true)) {
            return;
        }

        throw ValidationException::withMessages([
            'authorization' => ['Only company owners or admins can connect or disconnect Google Calendar integration.'],
        ]);
    }

    private function ensureUserIsCalendarAdminForCompany(int $userId, int $companyId): void
    {
        $isCalendarAdmin = DB::table('company_users')
            ->join('companies', 'companies.id', '=', 'company_users.company_id')
            ->where('company_users.user_id', $userId)
            ->where('company_users.company_id', $companyId)
            ->whereIn('company_users.role', ['owner', 'admin'])
            ->where('companies.status', 'active')
            ->exists();

        if ($isCalendarAdmin) {
            return;
        }

        throw ValidationException::withMessages([
            'integration' => ['Only the current company owner or admin can complete Google Calendar connection.'],
        ]);
    }
}
