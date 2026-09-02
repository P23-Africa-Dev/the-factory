<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MapCreditTransaction extends Model
{
    use HasFactory;

    public const TYPE_ALLOCATION = 'allocation';
    public const TYPE_TOPUP = 'topup';
    public const TYPE_CONSUMPTION = 'consumption';
    public const TYPE_RESET = 'reset';
    public const TYPE_ADMIN_ADJUST = 'admin_adjust';

    protected $fillable = [
        'company_id',
        'type',
        'sku',
        'credits',
        'usd_amount',
        'balance_after',
        'source',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'credits' => 'decimal:4',
            'usd_amount' => 'decimal:4',
            'balance_after' => 'decimal:4',
            'meta' => 'array',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
