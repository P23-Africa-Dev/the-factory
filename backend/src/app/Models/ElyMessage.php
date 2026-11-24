<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ElyMessage extends Model
{
    protected $fillable = [
        'thread_id', 'company_id', 'user_id', 'role', 'content', 'tool_calls', 'tool_call_id',
        'tool_name', 'is_error', 'payload', 'provider', 'model', 'input_tokens', 'output_tokens',
    ];

    protected function casts(): array
    {
        return [
            'tool_calls' => 'array',
            'payload' => 'array',
            'is_error' => 'boolean',
        ];
    }
}
