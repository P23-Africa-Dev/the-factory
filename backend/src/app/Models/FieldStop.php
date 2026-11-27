<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\FieldStopClassification;
use App\Enums\FieldStopClassifiedBy;
use App\Enums\FieldStopMatchType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FieldStop extends Model
{
    use HasFactory;

    protected $fillable = [
        'field_activity_session_id',
        'company_id',
        'user_id',
        'arrived_at',
        'departed_at',
        'latitude',
        'longitude',
        'address',
        'duration_seconds',
        'confidence',
        'match_type',
        'classification',
        'classified_by',
        'classified_at',
        'company_location_id',
        'lead_id',
        'meeting_id',
        'task_id',
        'reminder_sent',
        'meta',
        'source',
        'client_stop_id',
        'outcome',
        'notes',
        'follow_up_at',
        'record_status',
        'recorded_at',
        'recorded_via',
        'location_status',
        'original_latitude',
        'original_longitude',
        'original_address',
    ];

    public const SOURCE_DETECTED = 'detected';
    public const SOURCE_MANUAL = 'manual';

    public const RECORD_PENDING = 'pending';
    public const RECORD_RECORDED = 'recorded';

    public const LOCATION_UNCONFIRMED = 'unconfirmed';
    public const LOCATION_CONFIRMED = 'confirmed';
    public const LOCATION_CORRECTED = 'corrected';

    /** What happened at a visit. */
    public const OUTCOMES = ['successful', 'follow_up', 'nobody_available', 'not_interested', 'other'];

    protected function casts(): array
    {
        return [
            'arrived_at' => 'datetime',
            'departed_at' => 'datetime',
            'latitude' => 'float',
            'longitude' => 'float',
            'duration_seconds' => 'integer',
            'confidence' => 'float',
            'match_type' => FieldStopMatchType::class,
            'classification' => FieldStopClassification::class,
            'classified_by' => FieldStopClassifiedBy::class,
            'classified_at' => 'datetime',
            'reminder_sent' => 'boolean',
            'meta' => 'array',
            'follow_up_at' => 'date',
            'recorded_at' => 'datetime',
            'original_latitude' => 'float',
            'original_longitude' => 'float',
        ];
    }

    /** The person recorded what they did here (or attached something): never auto-delete it. */
    public function hasUserRecord(): bool
    {
        return $this->record_status === self::RECORD_RECORDED
            || $this->source === self::SOURCE_MANUAL
            || $this->attachments()->exists();
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(FieldStopAttachment::class)->orderBy('id');
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

    public function companyLocation(): BelongsTo
    {
        return $this->belongsTo(CompanyLocation::class);
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function meeting(): BelongsTo
    {
        return $this->belongsTo(Meeting::class);
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function isPending(): bool
    {
        return $this->classification === FieldStopClassification::PENDING;
    }

    public function isVisit(): bool
    {
        return in_array($this->classification, [
            FieldStopClassification::CUSTOMER_VISIT,
            FieldStopClassification::LEAD_VISIT,
            FieldStopClassification::ORG_VISIT,
        ], true);
    }
}
