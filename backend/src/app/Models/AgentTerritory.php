<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AgentTerritory extends Model
{
    public const MODE_AUTO = 'auto';

    public const MODE_MANUAL = 'manual';

    protected $fillable = [
        'company_id',
        'user_id',
        'name',
        'color',
        'mode',
        'geojson',
        'is_visible',
        'created_by_user_id',
        'updated_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'geojson' => 'array',
            'is_visible' => 'boolean',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function agent(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
