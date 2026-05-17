<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TaskTrackingSession extends Model
{
    use HasFactory;

    protected $fillable = [
        'task_id',
        'company_id',
        'started_by_user_id',
        'completed_by_user_id',
        'start_latitude',
        'start_longitude',
        'start_accuracy_meters',
        'start_recorded_at',
        'last_latitude',
        'last_longitude',
        'last_accuracy_meters',
        'last_recorded_at',
        'last_persisted_latitude',
        'last_persisted_longitude',
        'last_persisted_recorded_at',
        'destination_latitude',
        'destination_longitude',
        'destination_radius_meters',
        'near_detected_at',
        'near_latitude',
        'near_longitude',
        'arrival_detected_at',
        'arrival_latitude',
        'arrival_longitude',
        'end_latitude',
        'end_longitude',
        'end_accuracy_meters',
        'end_recorded_at',
    ];

    protected function casts(): array
    {
        return [
            'start_latitude' => 'float',
            'start_longitude' => 'float',
            'start_accuracy_meters' => 'float',
            'start_recorded_at' => 'datetime',
            'last_latitude' => 'float',
            'last_longitude' => 'float',
            'last_accuracy_meters' => 'float',
            'last_recorded_at' => 'datetime',
            'last_persisted_latitude' => 'float',
            'last_persisted_longitude' => 'float',
            'last_persisted_recorded_at' => 'datetime',
            'destination_latitude' => 'float',
            'destination_longitude' => 'float',
            'destination_radius_meters' => 'integer',
            'near_detected_at' => 'datetime',
            'near_latitude' => 'float',
            'near_longitude' => 'float',
            'arrival_detected_at' => 'datetime',
            'arrival_latitude' => 'float',
            'arrival_longitude' => 'float',
            'end_latitude' => 'float',
            'end_longitude' => 'float',
            'end_accuracy_meters' => 'float',
            'end_recorded_at' => 'datetime',
        ];
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function startedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'started_by_user_id');
    }

    public function completedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'completed_by_user_id');
    }

    public function points(): HasMany
    {
        return $this->hasMany(TaskLocationPoint::class, 'tracking_session_id');
    }
}
