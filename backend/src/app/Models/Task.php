<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Task extends Model
{
    use HasFactory;

    protected $fillable = [
        'company_id',
        'project_id',
        'created_by_user_id',
        'assigned_agent_id',
        'last_status_updated_by_user_id',
        'title',
        'type',
        'description',
        'location_text',
        'address_full',
        'latitude',
        'longitude',
        'due_at',
        'required_actions',
        'priority',
        'minimum_photos_required',
        'visit_verification_required',
        'status',
        'started_at',
        'paused_at',
        'resumed_at',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'due_at' => 'datetime',
            'required_actions' => 'array',
            'minimum_photos_required' => 'integer',
            'visit_verification_required' => 'boolean',
            'started_at' => 'datetime',
            'paused_at' => 'datetime',
            'resumed_at' => 'datetime',
            'completed_at' => 'datetime',
            'latitude' => 'float',
            'longitude' => 'float',
            'type' => TaskType::class,
            'priority' => TaskPriority::class,
            'status' => TaskStatus::class,
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function assignedAgent(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_agent_id');
    }

    public function statusUpdater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'last_status_updated_by_user_id');
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(TaskAssignment::class);
    }

    public function currentAssignees(): HasManyThrough
    {
        return $this->hasManyThrough(
            User::class,
            TaskAssignment::class,
            'task_id',
            'id',
            'id',
            'assigned_agent_id',
        )->where('task_assignments.is_current', true);
    }

    public function proofs(): HasMany
    {
        return $this->hasMany(TaskProof::class);
    }

    public function trackingSession(): HasOne
    {
        return $this->hasOne(TaskTrackingSession::class);
    }

    public function trackingPoints(): HasMany
    {
        return $this->hasMany(TaskLocationPoint::class);
    }
}
