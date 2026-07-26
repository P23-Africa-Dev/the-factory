<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlaceSearchEvent extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'company_id',
        'user_id',
        'source',
        'operation',
        'provider_final',
        'providers_tried',
        'cache_hit',
        'fallback_depth',
        'latency_ms',
        'result_count',
        'confidence',
        'sku',
        'credits_charged',
        'estimated_usd',
        'query_hash',
        'query_truncated',
        'status',
        'ip_hash',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'providers_tried' => 'array',
            'cache_hit' => 'boolean',
            'fallback_depth' => 'integer',
            'latency_ms' => 'integer',
            'result_count' => 'integer',
            'confidence' => 'float',
            'credits_charged' => 'float',
            'estimated_usd' => 'float',
            'created_at' => 'datetime',
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
}
