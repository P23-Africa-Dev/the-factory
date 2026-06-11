<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiAutomationRule extends Model
{
    use HasFactory;

    protected $fillable = [
        'company_id',
        'created_by_user_id',
        'name',
        'prompt',
        'trigger_type',
        'trigger_expression',
        'action_tool',
        'action_args',
        'status',
        'last_run_at',
    ];

    protected function casts(): array
    {
        return [
            'action_args' => 'array',
            'last_run_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }
}
