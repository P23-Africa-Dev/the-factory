<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ElyPendingAction extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_CONFIRMED = 'confirmed';

    public const STATUS_CANCELLED = 'cancelled';

    public const STATUS_EXPIRED = 'expired';

    public const STATUS_FAILED = 'failed';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id', 'thread_id', 'company_id', 'user_id', 'tool', 'args', 'args_hash', 'version',
        'status', 'tool_call_id', 'result', 'expires_at', 'resolved_at',
    ];

    protected function casts(): array
    {
        return [
            'args' => 'array',
            'result' => 'array',
            'expires_at' => 'datetime',
            'resolved_at' => 'datetime',
        ];
    }

    public function isOpen(): bool
    {
        return $this->status === self::STATUS_PENDING && $this->expires_at->isFuture();
    }
}
