<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\FieldActivitySessionStatus;
use App\Enums\FieldMovementState;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class FieldActivitySession extends Model
{
    use HasFactory;

    /** Legacy: started by clock-in (one per attendance day). */
    public const SOURCE_ATTENDANCE = 'attendance';

    /** Started on demand with "Start Field Trip"; any number per day. */
    public const SOURCE_FIELD_TRIP = 'field_trip';

    public const END_REASON_USER = 'user';
    public const END_REASON_AUTO_NO_SIGNAL = 'auto_no_signal';
    public const END_REASON_AUTO_LEGACY = 'auto_legacy';
    /** Field Activity was turned off for the company while the trip ran. */
    public const END_REASON_DISABLED = 'feature_disabled';

    protected $fillable = [
        'company_id',
        'user_id',
        'attendance_record_id',
        'source',
        'client_trip_id',
        'status',
        'started_at',
        'ended_at',
        'end_reason',
        'distance_meters',
        'travel_seconds',
        'stationary_seconds',
        'stop_count',
        'visit_count',
        'unknown_stop_count',
        'last_latitude',
        'last_longitude',
        'last_accuracy_meters',
        'last_recorded_at',
        'last_received_at',
        'last_movement_state',
        'last_persisted_latitude',
        'last_persisted_longitude',
        'last_persisted_recorded_at',
        'distance_anchor_latitude',
        'distance_anchor_longitude',
        'stop_scan_cursor_at',
        'last_reminded_at',
        'signal_lost_notified_at',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'status' => FieldActivitySessionStatus::class,
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
            'distance_meters' => 'integer',
            'travel_seconds' => 'integer',
            'stationary_seconds' => 'integer',
            'stop_count' => 'integer',
            'visit_count' => 'integer',
            'unknown_stop_count' => 'integer',
            'last_latitude' => 'float',
            'last_longitude' => 'float',
            'last_accuracy_meters' => 'float',
            'last_recorded_at' => 'datetime',
            'last_received_at' => 'datetime',
            'last_movement_state' => FieldMovementState::class,
            'last_persisted_latitude' => 'float',
            'last_persisted_longitude' => 'float',
            'last_persisted_recorded_at' => 'datetime',
            'distance_anchor_latitude' => 'float',
            'distance_anchor_longitude' => 'float',
            'stop_scan_cursor_at' => 'datetime',
            'last_reminded_at' => 'datetime',
            'signal_lost_notified_at' => 'datetime',
            'meta' => 'array',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function attendanceRecord(): BelongsTo
    {
        return $this->belongsTo(AttendanceRecord::class);
    }

    public function points(): HasMany
    {
        return $this->hasMany(FieldLocationPoint::class);
    }

    public function stops(): HasMany
    {
        return $this->hasMany(FieldStop::class);
    }

    public function dailySummary(): HasOne
    {
        return $this->hasOne(FieldDailySummary::class);
    }

    public function isFieldTrip(): bool
    {
        return ($this->source ?? self::SOURCE_ATTENDANCE) === self::SOURCE_FIELD_TRIP;
    }

    public function isActive(): bool
    {
        return $this->status === FieldActivitySessionStatus::ACTIVE;
    }
}
