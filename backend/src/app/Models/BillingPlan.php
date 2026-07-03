<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BillingPlan extends Model
{
    use HasFactory;

    protected $fillable = [
        'plan_key',
        'label',
        'seat_limit',
        'monthly_amount',
        'annual_amount',
        'monthly_price_id',
        'annual_price_id',
        'is_active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'seat_limit' => 'integer',
            'monthly_amount' => 'integer',
            'annual_amount' => 'integer',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }
}
