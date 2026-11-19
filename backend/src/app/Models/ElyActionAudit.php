<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ElyActionAudit extends Model
{
    protected $fillable = [
        'company_id', 'user_id', 'role', 'thread_id', 'tool', 'args', 'outcome', 'error', 'result',
        'pending_action_id', 'confirmed', 'undo', 'undone_at', 'ip', 'user_agent',
    ];

    protected function casts(): array
    {
        return [
            'args' => 'array',
            'result' => 'array',
            'undo' => 'array',
            'confirmed' => 'boolean',
            'undone_at' => 'datetime',
        ];
    }
}
