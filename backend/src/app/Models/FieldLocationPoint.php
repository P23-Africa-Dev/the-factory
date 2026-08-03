<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\FieldMovementState;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FieldLocationPoint extends Model
{
    use HasFactory;

    protected $fillable = [
        'field_activity_session_id',
        'company_id',
        'user_id',
        'task_id',
        'task_tracking_session_id',
        'latitude',
        'longitude',
        'accuracy_meters',
        'speed_mps',
        'heading_degrees',
        'distance_from_previous_meters',
        'movement_state',
        'recorded_at',
    ];

    protected function casts(): array
    {
        return [
            'latitude' => 'float',
            'longitude' => 'float',
            'accuracy_meters' => 'float',
            'speed_mps' => 'float',
            'heading_degrees' => 'float',
            'distance_from_previous_meters' => 'float',
            'movement_state' => FieldMovementState::class,
            'recorded_at' => 'datetime',
        ];
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(FieldActivitySession::class, 'field_activity_session_id');
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function taskTrackingSession(): BelongsTo
    {
        return $this->belongsTo(TaskTrackingSession::class, 'task_tracking_session_id');
    }
}
