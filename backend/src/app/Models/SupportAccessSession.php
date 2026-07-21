<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Laravel\Sanctum\PersonalAccessToken;

class SupportAccessSession extends Model
{
    public const ACCESS_READ_ONLY = 'read_only';

    public const ACCESS_OPERATIONAL_FULL = 'operational_full';

    protected $fillable = [
        'admin_id',
        'target_user_id',
        'company_id',
        'personal_access_token_id',
        'access_level',
        'reason',
        'ticket_reference',
        'exchange_code_hash',
        'exchange_code_expires_at',
        'exchanged_at',
        'session_expires_at',
        'ended_at',
        'revoked_at',
        'admin_name_snapshot',
        'admin_email_snapshot',
        'target_name_snapshot',
        'target_email_snapshot',
        'company_name_snapshot',
        'target_company_role_snapshot',
        'request_ip',
        'request_user_agent',
    ];

    protected $hidden = [
        'exchange_code_hash',
    ];

    protected function casts(): array
    {
        return [
            'exchange_code_expires_at' => 'datetime',
            'exchanged_at' => 'datetime',
            'session_expires_at' => 'datetime',
            'ended_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    public function admin(): BelongsTo
    {
        return $this->belongsTo(Admin::class);
    }

    public function targetUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'target_user_id');
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function personalAccessToken(): BelongsTo
    {
        return $this->belongsTo(PersonalAccessToken::class, 'personal_access_token_id');
    }

    public function isActive(): bool
    {
        return $this->exchanged_at !== null
            && $this->ended_at === null
            && $this->revoked_at === null
            && $this->session_expires_at?->isFuture();
    }
}
