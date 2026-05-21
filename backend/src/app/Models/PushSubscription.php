<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PushSubscription extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'company_id',
        'provider',
        'platform',
        'device_token',
        'endpoint',
        'subscription_payload',
        'user_agent',
        'is_active',
        'failed_attempts',
        'last_failure_reason',
        'last_failed_at',
        'last_seen_at',
    ];

    protected function casts(): array
    {
        return [
            'subscription_payload' => 'array',
            'is_active' => 'boolean',
            'failed_attempts' => 'integer',
            'last_failed_at' => 'datetime',
            'last_seen_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
