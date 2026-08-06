<?php

declare(strict_types=1);

namespace App\Services\Email;

use App\Models\EmailAccount;
use App\Models\User;
use App\Services\Company\CompanyContextService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class EmailAccountService
{
    public function __construct(
        private readonly CompanyContextService $companyContextService,
    ) {}

    /**
     * List all connected email accounts for the authenticated user.
     *
     * @return \Illuminate\Database\Eloquent\Collection<int,EmailAccount>
     */
    public function listForUser(User $user, ?int $companyId = null): \Illuminate\Database\Eloquent\Collection
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;

        return EmailAccount::query()
            ->where('company_id', $resolvedCompanyId)
            ->where('user_id', $user->id)
            ->orderByDesc('is_default')
            ->orderBy('email')
            ->get();
    }

    /**
     * Connect a new email account.
     *
     * @param  array<string,mixed>  $data
     */
    public function connect(User $user, array $data): EmailAccount
    {
        $context = $this->companyContextService->resolve($user, $data['company_id'] ?? null);
        $resolvedCompanyId = (int) $context['company']->id;
        $provider = (string) ($data['provider'] ?? '');
        $email = strtolower(trim((string) ($data['email'] ?? '')));

        if (! in_array($provider, ['google', 'microsoft', 'zoho', 'imap_smtp'], true)) {
            throw ValidationException::withMessages([
                'provider' => ['Unsupported email provider.'],
            ]);
        }

        if ($email === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw ValidationException::withMessages([
                'email' => ['A valid email address is required.'],
            ]);
        }

        // Check for duplicate
        $existing = EmailAccount::query()
            ->where('company_id', $resolvedCompanyId)
            ->where('user_id', $user->id)
            ->where('email', $email)
            ->first();

        if ($existing !== null) {
            throw ValidationException::withMessages([
                'email' => ['This email account is already connected.'],
            ]);
        }

        $account = DB::transaction(function () use ($resolvedCompanyId, $user, $provider, $email, $data): EmailAccount {
            // If this is the first account, make it default
            $existingCount = EmailAccount::query()
                ->where('company_id', $resolvedCompanyId)
                ->where('user_id', $user->id)
                ->count();

            $isDefault = (bool) ($data['is_default'] ?? ($existingCount === 0));

            // If setting as a default, unset other defaults
            if ($isDefault) {
                EmailAccount::query()
                    ->where('company_id', $resolvedCompanyId)
                    ->where('user_id', $user->id)
                    ->update(['is_default' => false]);
            }

            return EmailAccount::query()->create([
                'company_id' => $resolvedCompanyId,
                'user_id' => $user->id,
                'provider' => $provider,
                'email' => $email,
                'display_name' => $data['display_name'] ?? null,
                'access_token_encrypted' => $data['access_token'] ?? null,
                'refresh_token_encrypted' => $data['refresh_token'] ?? null,
                'token_expires_at' => $data['token_expires_at'] ?? null,
                'scopes' => $data['scopes'] ?? [],
                'provider_metadata' => $data['provider_metadata'] ?? [],
                'smtp_host' => $data['smtp_host'] ?? null,
                'smtp_port' => $data['smtp_port'] ?? null,
                'smtp_encryption' => $data['smtp_encryption'] ?? null,
                'smtp_username' => $data['smtp_username'] ?? null,
                'smtp_password_encrypted' => $data['smtp_password'] ?? null,
                'imap_host' => $data['imap_host'] ?? null,
                'imap_port' => $data['imap_port'] ?? null,
                'imap_encryption' => $data['imap_encryption'] ?? null,
                'imap_username' => $data['imap_username'] ?? null,
                'imap_password_encrypted' => $data['imap_password'] ?? null,
                'is_default' => $isDefault,
                'status' => 'active',
                'connected_at' => now(),
            ]);
        });

        Log::info('Email account connected', [
            'company_id' => $resolvedCompanyId,
            'user_id' => $user->id,
            'provider' => $provider,
            'email' => $email,
            'account_id' => $account->id,
        ]);

        return $account;
    }

    /**
     * Disconnect an email account.
     */
    public function disconnect(User $user, EmailAccount $account, ?int $companyId = null): void
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;

        $this->assertAccountBelongsToUser($account, $resolvedCompanyId, (int) $user->id);

        $account->update([
            'status' => 'disconnected',
            'disconnected_at' => now(),
            'access_token_encrypted' => null,
            'refresh_token_encrypted' => null,
            'smtp_password_encrypted' => null,
            'imap_password_encrypted' => null,
        ]);

        Log::info('Email account disconnected', [
            'company_id' => $resolvedCompanyId,
            'user_id' => $user->id,
            'provider' => $account->provider,
            'email' => $account->email,
            'account_id' => $account->id,
        ]);
    }

    /**
     * Set an account as the default sending account.
     */
    public function setDefault(User $user, EmailAccount $account, ?int $companyId = null): EmailAccount
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;

        $this->assertAccountBelongsToUser($account, $resolvedCompanyId, (int) $user->id);

        DB::transaction(function () use ($resolvedCompanyId, $user, $account): void {
            EmailAccount::query()
                ->where('company_id', $resolvedCompanyId)
                ->where('user_id', $user->id)
                ->update(['is_default' => false]);

            $account->update(['is_default' => true]);
        });

        Log::info('Email account set as default', [
            'company_id' => $resolvedCompanyId,
            'user_id' => $user->id,
            'provider' => $account->provider,
            'email' => $account->email,
            'account_id' => $account->id,
        ]);

        return $account->fresh();
    }

    /**
     * Rename an account (display name).
     */
    public function rename(User $user, EmailAccount $account, string $displayName, ?int $companyId = null): EmailAccount
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;

        $this->assertAccountBelongsToUser($account, $resolvedCompanyId, (int) $user->id);

        $account->update(['display_name' => trim($displayName)]);

        return $account->fresh();
    }

    /**
     * Refresh OAuth tokens for an account.
     */
    public function refreshTokens(User $user, EmailAccount $account, string $accessToken, string $refreshToken, ?string $expiresAt = null, ?int $companyId = null): EmailAccount
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;

        $this->assertAccountBelongsToUser($account, $resolvedCompanyId, (int) $user->id);

        $account->update([
            'access_token_encrypted' => $accessToken,
            'refresh_token_encrypted' => $refreshToken,
            'token_expires_at' => $expiresAt,
            'last_token_refresh_at' => now(),
            'status' => 'active',
            'last_error_message' => null,
            'last_error_at' => null,
        ]);

        Log::info('Email account tokens refreshed', [
            'company_id' => $resolvedCompanyId,
            'user_id' => $user->id,
            'provider' => $account->provider,
            'email' => $account->email,
            'account_id' => $account->id,
        ]);

        return $account->fresh();
    }

    /**
     * Mark an account as having an error.
     */
    public function markError(EmailAccount $account, string $errorMessage): void
    {
        $account->update([
            'status' => 'error',
            'last_error_message' => $errorMessage,
            'last_error_at' => now(),
        ]);

        Log::warning('Email account marked as error', [
            'company_id' => $account->company_id,
            'user_id' => $account->user_id,
            'provider' => $account->provider,
            'email' => $account->email,
            'account_id' => $account->id,
            'error' => $errorMessage,
        ]);
    }

    /**
     * Update sync state after a successful sync.
     */
    public function updateSyncState(EmailAccount $account, ?string $historyId): void
    {
        $account->update([
            'history_id' => $historyId,
            'last_synced_at' => now(),
        ]);
    }

    /**
     * Get the user's default sending account.
     */
    public function getDefaultAccount(User $user, ?int $companyId = null): ?EmailAccount
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;

        return EmailAccount::query()
            ->where('company_id', $resolvedCompanyId)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->where('is_default', true)
            ->first()
            ?? EmailAccount::query()
            ->where('company_id', $resolvedCompanyId)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->orderBy('created_at')
            ->first();
    }

    /**
     * Test the connection for an email account.
     *
     * @return array{ok:bool,message:string}
     */
    public function testConnection(User $user, EmailAccount $account, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;

        $this->assertAccountBelongsToUser($account, $resolvedCompanyId, (int) $user->id);

        $provider = $this->resolveProvider($account);

        try {
            $result = $provider->testConnection($account->toDTO());

            if (! $result) {
                $message = 'Connection test failed. Please check your credentials and try again.';
                $this->markError($account, $message);

                return ['ok' => false, 'message' => $message];
            }

            $account->update([
                'status' => 'active',
                'last_error_message' => null,
                'last_error_at' => null,
            ]);

            Log::info('Email account connection test succeeded', [
                'company_id' => $resolvedCompanyId,
                'user_id' => $user->id,
                'provider' => $account->provider,
                'email' => $account->email,
                'account_id' => $account->id,
            ]);

            return ['ok' => true, 'message' => 'Connection test successful.'];
        } catch (\Throwable $e) {
            $message = $this->connectionExceptionMessage($e);

            Log::warning('Email account connection test failed', [
                'company_id' => $resolvedCompanyId,
                'user_id' => $user->id,
                'provider' => $account->provider,
                'email' => $account->email,
                'account_id' => $account->id,
                'error' => $message,
            ]);

            $this->markError($account, $message);

            return ['ok' => false, 'message' => $message];
        }
    }

    private function connectionExceptionMessage(\Throwable $e): string
    {
        if ($e instanceof ValidationException) {
            $first = collect($e->errors())->flatten()->first();
            if (is_string($first) && trim($first) !== '') {
                return trim($first);
            }
        }

        $message = trim($e->getMessage());

        if ($message === '' || $message === 'The given data was invalid.') {
            return 'Connection test failed. Please check your credentials and try again.';
        }

        return $message;
    }

    /**
     * Connect or reconnect an account from an OAuth token exchange.
     *
     * @param  array<string,mixed>  $data
     */
    public function connectFromOAuth(User $user, array $data): EmailAccount
    {
        $context = $this->companyContextService->resolve($user, $data['company_id'] ?? null);
        $resolvedCompanyId = (int) $context['company']->id;
        $provider = (string) ($data['provider'] ?? '');
        $email = strtolower(trim((string) ($data['email'] ?? '')));

        if (! in_array($provider, ['google', 'microsoft', 'zoho'], true)) {
            throw ValidationException::withMessages([
                'provider' => ['Unsupported OAuth email provider.'],
            ]);
        }

        if ($email === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw ValidationException::withMessages([
                'email' => ['A valid email address is required.'],
            ]);
        }

        $existing = EmailAccount::withTrashed()
            ->where('company_id', $resolvedCompanyId)
            ->where('user_id', $user->id)
            ->where('email', $email)
            ->first();

        return DB::transaction(function () use ($existing, $resolvedCompanyId, $user, $provider, $email, $data): EmailAccount {
            $existingCount = EmailAccount::query()
                ->where('company_id', $resolvedCompanyId)
                ->where('user_id', $user->id)
                ->count();

            $isDefault = (bool) ($data['is_default'] ?? ($existingCount === 0 && $existing === null));

            if ($isDefault) {
                EmailAccount::query()
                    ->where('company_id', $resolvedCompanyId)
                    ->where('user_id', $user->id)
                    ->update(['is_default' => false]);
            }

            $attributes = [
                'provider' => $provider,
                'display_name' => $data['display_name'] ?? null,
                'access_token_encrypted' => $data['access_token'] ?? null,
                'refresh_token_encrypted' => $data['refresh_token'] ?? null,
                'token_expires_at' => $data['token_expires_at'] ?? null,
                'scopes' => $data['scopes'] ?? [],
                'provider_metadata' => $data['provider_metadata'] ?? [],
                'status' => 'active',
                'is_default' => $isDefault || (bool) ($existing?->is_default),
                'last_error_message' => null,
                'last_error_at' => null,
                'connected_at' => now(),
                'disconnected_at' => null,
                'last_token_refresh_at' => now(),
            ];

            if ($existing !== null) {
                if ($existing->trashed()) {
                    $existing->restore();
                }

                // Keep existing refresh token if provider omitted a new one.
                if (empty($attributes['refresh_token_encrypted']) && $existing->refresh_token_encrypted) {
                    unset($attributes['refresh_token_encrypted']);
                }

                $existing->update($attributes);

                Log::info('Email account reconnected via OAuth', [
                    'company_id' => $resolvedCompanyId,
                    'user_id' => $user->id,
                    'provider' => $provider,
                    'email' => $email,
                    'account_id' => $existing->id,
                ]);

                return $existing->fresh();
            }

            $account = EmailAccount::query()->create(array_merge($attributes, [
                'company_id' => $resolvedCompanyId,
                'user_id' => $user->id,
                'email' => $email,
            ]));

            Log::info('Email account connected via OAuth', [
                'company_id' => $resolvedCompanyId,
                'user_id' => $user->id,
                'provider' => $provider,
                'email' => $email,
                'account_id' => $account->id,
            ]);

            return $account;
        });
    }

    /**
     * Resolve the appropriate provider implementation for an account.
     */
    public function resolveProvider(EmailAccount $account): EmailProviderInterface
    {
        return match ($account->provider) {
            'google' => app(Providers\GoogleProvider::class),
            'microsoft' => app(Providers\MicrosoftProvider::class),
            'zoho' => app(Providers\ZohoProvider::class),
            'imap_smtp' => app(Providers\ImapSmtpProvider::class),
            default => throw ValidationException::withMessages([
                'provider' => ['Unsupported email provider: ' . $account->provider],
            ]),
        };
    }

    private function assertAccountBelongsToUser(EmailAccount $account, int $companyId, int $userId): void
    {
        if ($account->company_id !== $companyId || $account->user_id !== $userId) {
            throw ValidationException::withMessages([
                'account' => ['Email account not found.'],
            ]);
        }
    }
}
