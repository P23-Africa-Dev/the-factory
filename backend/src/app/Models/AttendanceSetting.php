<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AttendanceSetting extends Model
{
    use HasFactory;

    protected $fillable = [
        'company_id',
        'opening_time',
        'closing_time',
        'working_days',
        'clockin_window_minutes',
        'auto_clockout_enabled',
        'timezone',
    ];

    protected function casts(): array
    {
        return [
            'working_days' => 'array',
            'clockin_window_minutes' => 'integer',
            'auto_clockout_enabled' => 'boolean',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
