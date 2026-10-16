<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\LeadFieldStatus;
use App\Enums\LeadFieldType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeadFieldDefinition extends Model
{
    protected $fillable = [
        'company_id',
        'key',
        'label',
        'description',
        'type',
        'options',
        'is_required',
        'show_on_create',
        'show_in_list',
        'status',
        'sort_order',
        'created_by_user_id',
        'reviewed_by_user_id',
        'reviewed_at',
        'decline_reason',
    ];

    protected function casts(): array
    {
        return [
            'type' => LeadFieldType::class,
            'status' => LeadFieldStatus::class,
            'options' => 'array',
            'is_required' => 'boolean',
            'show_on_create' => 'boolean',
            'show_in_list' => 'boolean',
            'reviewed_at' => 'datetime',
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

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by_user_id');
    }
}
