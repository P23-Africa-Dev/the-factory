<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FieldDailySummary extends Model
{
    use HasFactory;

    protected $fillable = [
        'company_id',
        'user_id',
        'field_activity_session_id',
        'summary_date',
        'distance_meters',
        'travel_seconds',
        'stationary_seconds',
        'stop_count',
        'visit_count',
        'unknown_stop_count',
        'personal_stop_count',
        'ignored_stop_count',
        'narrative',
        'metrics',
        'generated_at',
    ];

    protected function casts(): array
    {
        return [
            'summary_date' => 'date',
            'distance_meters' => 'integer',
            'travel_seconds' => 'integer',
            'stationary_seconds' => 'integer',
            'stop_count' => 'integer',
            'visit_count' => 'integer',
            'unknown_stop_count' => 'integer',
            'personal_stop_count' => 'integer',
            'ignored_stop_count' => 'integer',
            'metrics' => 'array',
            'generated_at' => 'datetime',
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

    public function session(): BelongsTo
    {
        return $this->belongsTo(FieldActivitySession::class, 'field_activity_session_id');
    }
}
