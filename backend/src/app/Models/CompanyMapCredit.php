<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CompanyMapCredit extends Model
{
    use HasFactory;

    protected $fillable = [
        'company_id',
        'plan_credits',
        'topup_credits',
        'allocation_credits',
        'lifetime_consumed',
        'lifetime_topped_up',
        'period_start',
        'period_end',
        'last_reset_at',
    ];

    protected function casts(): array
    {
        return [
            'plan_credits' => 'decimal:4',
            'topup_credits' => 'decimal:4',
            'allocation_credits' => 'decimal:4',
            'lifetime_consumed' => 'decimal:4',
            'lifetime_topped_up' => 'decimal:4',
            'period_start' => 'datetime',
            'period_end' => 'datetime',
            'last_reset_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function totalBalance(): float
    {
        return round((float) $this->plan_credits + (float) $this->topup_credits, 4);
    }
}
