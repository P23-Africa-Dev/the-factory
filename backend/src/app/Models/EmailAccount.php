<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class EmailAccount extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'company_id',
        'user_id',
        'provider',
        'email',
        'display_name',
        'access_token_encrypted',
        'refresh_token_encrypted',
        'token_expires_at',
        'last_token_refresh_at',
        'scopes',
        'provider_metadata',
        'smtp_host',
        'smtp_port',
        'smtp_encryption',
        'smtp_username',
        'smtp_password_encrypted',
        'imap_host',
        'imap_port',
        'imap_encryption',
        'imap_username',
        'imap_password_encrypted',
        'history_id',
        'last_synced_at',
        'status',
        'is_default',
        'last_error_message',
        'last_error_at',
        'connected_at',
        'disconnected_at',
    ];

    protected function casts(): array
    {
        return [
            'access_token_encrypted' => 'encrypted',
            'refresh_token_encrypted' => 'encrypted',
            'smtp_password_encrypted' => 'encrypted',
            'imap_password_encrypted' => 'encrypted',
            'scopes' => 'array',
            'provider_metadata' => 'array',
            'token_expires_at' => 'datetime',
            'last_token_refresh_at' => 'datetime',
            'last_synced_at' => 'datetime',
            'last_error_at' => 'datetime',
            'connected_at' => 'datetime',
            'disconnected_at' => 'datetime',
            'is_default' => 'boolean',
            'smtp_port' => 'integer',
            'imap_port' => 'integer',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Convert to an EmailAccountDTO for use with providers.
     */
    public function toDTO(): \App\Services\Email\EmailAccountDTO
    {
        return \App\Services\Email\EmailAccountDTO::fromArray($this->toArray());
    }
}
