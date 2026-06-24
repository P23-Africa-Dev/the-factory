<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\LeadPriority;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Lead extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'company_id',
        'pipeline_id',
        'company_location_id',
        'created_by_user_id',
        'assigned_to_user_id',
        'name',
        'email',
        'phone',
        'location',
        'source',
        'status',
        'priority',
        'next_action',
        'last_interaction',
        'last_interaction_at',
        'meta',
        'converted_at',
    ];

    protected function casts(): array
    {
        return [
            'status' => 'string',
            'priority' => LeadPriority::class,
            'meta' => 'array',
            'last_interaction_at' => 'datetime',
            'converted_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function pipeline(): BelongsTo
    {
        return $this->belongsTo(LeadPipeline::class, 'pipeline_id');
    }

    public function companyLocation(): BelongsTo
    {
        return $this->belongsTo(CompanyLocation::class, 'company_location_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to_user_id');
    }

    public function notes(): HasMany
    {
        return $this->hasMany(LeadNote::class);
    }

    public function activities(): HasMany
    {
        return $this->hasMany(LeadActivity::class);
    }

    public function meetings(): BelongsToMany
    {
        return $this->belongsToMany(Meeting::class, 'meeting_leads')->withTimestamps();
    }
}
