<?php

declare(strict_types=1);

namespace App\Services\Email;

/**
 * Data Transfer Object representing a connected email account.
 *
 * This DTO is provider-agnostic. Each provider implementation
 * extracts the fields it needs from this unified structure.
 */
final class EmailAccountDTO
{
    /**
     * @param  int                 $id               Internal email account ID.
     * @param  int                 $companyId        Tenant company ID.
     * @param  int                 $userId           Owning user ID.
     * @param  string              $provider         Provider slug (google, microsoft, zoho, imap_smtp).
     * @param  string              $email            Email address of the connected account.
     * @param  string|null         $displayName      User-facing display name for this account.
     * @param  string|null         $accessToken      OAuth access token (encrypted at rest).
     * @param  string|null         $refreshToken     OAuth refresh token (encrypted at rest).
     * @param  string|null         $tokenExpiresAt   ISO 8601 timestamp.
     * @param  array<int,string>   $scopes           Granted OAuth scopes.
     * @param  string|null         $smtpHost
     * @param  int|null            $smtpPort
     * @param  string|null         $smtpEncryption   tls, ssl, or null.
     * @param  string|null         $smtpUsername
     * @param  string|null         $smtpPassword     (encrypted at rest).
     * @param  string|null         $imapHost
     * @param  int|null            $imapPort
     * @param  string|null         $imapEncryption   tls, ssl, or null.
     * @param  string|null         $imapUsername
     * @param  string|null         $imapPassword     (encrypted at rest).
     * @param  string              $status           active, error, disconnected.
     * @param  string|null         $lastError
     * @param  string|null         $lastSyncedAt
     * @param  string|null         $historyId        Provider-specific sync cursor.
     * @param  bool                $isDefault        Whether this is the user's default sending account.
     */
    public function __construct(
        public readonly int $id,
        public readonly int $companyId,
        public readonly int $userId,
        public readonly string $provider,
        public readonly string $email,
        public readonly ?string $displayName = null,
        public readonly ?string $accessToken = null,
        public readonly ?string $refreshToken = null,
        public readonly ?string $tokenExpiresAt = null,
        public readonly array $scopes = [],
        /** @var array<string, mixed> */
        public readonly array $providerMetadata = [],
        public readonly ?string $smtpHost = null,
        public readonly ?int $smtpPort = null,
        public readonly ?string $smtpEncryption = null,
        public readonly ?string $smtpUsername = null,
        public readonly ?string $smtpPassword = null,
        public readonly ?string $imapHost = null,
        public readonly ?int $imapPort = null,
        public readonly ?string $imapEncryption = null,
        public readonly ?string $imapUsername = null,
        public readonly ?string $imapPassword = null,
        public readonly string $status = 'active',
        public readonly ?string $lastError = null,
        public readonly ?string $lastSyncedAt = null,
        public readonly ?string $historyId = null,
        public readonly bool $isDefault = false,
    ) {}

    /**
     * Create from an Eloquent model array.
     *
     * @param  array<string,mixed>  $attributes
     */
    public static function fromArray(array $attributes): self
    {
        return new self(
            id: (int) ($attributes['id'] ?? 0),
            companyId: (int) ($attributes['company_id'] ?? 0),
            userId: (int) ($attributes['user_id'] ?? 0),
            provider: (string) ($attributes['provider'] ?? ''),
            email: (string) ($attributes['email'] ?? ''),
            displayName: isset($attributes['display_name']) ? (string) $attributes['display_name'] : null,
            accessToken: isset($attributes['access_token_encrypted']) ? (string) $attributes['access_token_encrypted'] : null,
            refreshToken: isset($attributes['refresh_token_encrypted']) ? (string) $attributes['refresh_token_encrypted'] : null,
            tokenExpiresAt: isset($attributes['token_expires_at']) ? (string) $attributes['token_expires_at'] : null,
            scopes: is_array($attributes['scopes'] ?? null) ? $attributes['scopes'] : [],
            providerMetadata: is_array($attributes['provider_metadata'] ?? null) ? $attributes['provider_metadata'] : [],
            smtpHost: isset($attributes['smtp_host']) ? (string) $attributes['smtp_host'] : null,
            smtpPort: isset($attributes['smtp_port']) ? (int) $attributes['smtp_port'] : null,
            smtpEncryption: isset($attributes['smtp_encryption']) ? (string) $attributes['smtp_encryption'] : null,
            smtpUsername: isset($attributes['smtp_username']) ? (string) $attributes['smtp_username'] : null,
            smtpPassword: isset($attributes['smtp_password_encrypted']) ? (string) $attributes['smtp_password_encrypted'] : null,
            imapHost: isset($attributes['imap_host']) ? (string) $attributes['imap_host'] : null,
            imapPort: isset($attributes['imap_port']) ? (int) $attributes['imap_port'] : null,
            imapEncryption: isset($attributes['imap_encryption']) ? (string) $attributes['imap_encryption'] : null,
            imapUsername: isset($attributes['imap_username']) ? (string) $attributes['imap_username'] : null,
            imapPassword: isset($attributes['imap_password_encrypted']) ? (string) $attributes['imap_password_encrypted'] : null,
            status: (string) ($attributes['status'] ?? 'active'),
            lastError: isset($attributes['last_error_message']) ? (string) $attributes['last_error_message'] : null,
            lastSyncedAt: isset($attributes['last_synced_at']) ? (string) $attributes['last_synced_at'] : null,
            historyId: isset($attributes['history_id']) ? (string) $attributes['history_id'] : null,
            isDefault: (bool) ($attributes['is_default'] ?? false),
        );
    }
}
