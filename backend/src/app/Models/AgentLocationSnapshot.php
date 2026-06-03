<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AgentLocationSnapshot extends Model
{
    use HasFactory;

    protected $fillable = [
        'company_id',
        'user_id',
        'task_id',
        'tracking_session_id',
        'latitude',
        'longitude',
        'accuracy_meters',
        'speed_mps',
        'heading_degrees',
        'event_type',
        'task_status',
        'arrived',
        'recorded_at',
        'last_seen_at',
    ];

    protected function casts(): array
    {
        return [
            'latitude' => 'float',
            'longitude' => 'float',
            'accuracy_meters' => 'float',
            'speed_mps' => 'float',
            'heading_degrees' => 'float',
            'arrived' => 'boolean',
            'recorded_at' => 'datetime',
            'last_seen_at' => 'datetime',
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

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function trackingSession(): BelongsTo
    {
        return $this->belongsTo(TaskTrackingSession::class, 'tracking_session_id');
    }
}
