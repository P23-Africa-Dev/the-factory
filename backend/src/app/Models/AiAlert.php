<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AiAlert extends Model
{
    protected $fillable = [
        'type',
        'provider',
        'severity',
        'title',
        'message',
        'status',
        'resolved_at',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'meta' => 'array',
            'resolved_at' => 'datetime',
        ];
    }
}
