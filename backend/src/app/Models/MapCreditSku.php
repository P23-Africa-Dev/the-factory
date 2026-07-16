<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MapCreditSku extends Model
{
    use HasFactory;

    protected $fillable = [
        'sku',
        'label',
        'credit_cost',
        'usd_per_1k',
        'is_active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'credit_cost' => 'decimal:4',
            'usd_per_1k' => 'decimal:4',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }
}
