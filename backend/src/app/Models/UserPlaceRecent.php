<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserPlaceRecent extends Model
{
    protected $fillable = [
        'user_id',
        'company_id',
        'name',
        'address',
        'latitude',
        'longitude',
        'provider',
        'provider_place_id',
        'last_used_at',
    ];

    protected function casts(): array
    {
        return [
            'latitude' => 'float',
            'longitude' => 'float',
            'last_used_at' => 'datetime',
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

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'address' => $this->address,
            'latitude' => $this->latitude,
            'longitude' => $this->longitude,
            'provider' => $this->provider,
            'provider_place_id' => $this->provider_place_id,
            'last_used_at' => $this->last_used_at?->toIso8601String(),
        ];
    }
}
