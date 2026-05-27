<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AttendancePayrollSummary extends Model
{
    use HasFactory;

    protected $fillable = [
        'company_id',
        'user_id',
        'payroll_setting_id',
        'cycle_type',
        'period_year',
        'period_month',
        'period_start',
        'period_end',
        'attendance_days',
        'scheduled_work_days',
        'daily_rate',
        'salary_payable',
        'currency',
        'status',
        'approved_at',
        'approved_by_user_id',
        'revoked_at',
        'revoked_by_user_id',
        'approval_reason',
        'generated_at',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'cycle_type' => 'string',
            'period_year' => 'integer',
            'period_month' => 'integer',
            'period_start' => 'date',
            'period_end' => 'date',
            'attendance_days' => 'integer',
            'scheduled_work_days' => 'integer',
            'daily_rate' => 'decimal:2',
            'salary_payable' => 'decimal:2',
            'status' => 'string',
            'approved_at' => 'datetime',
            'revoked_at' => 'datetime',
            'generated_at' => 'datetime',
            'metadata' => 'array',
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

    public function payrollSetting(): BelongsTo
    {
        return $this->belongsTo(PayrollSetting::class);
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_user_id');
    }

    public function revokedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'revoked_by_user_id');
    }
}
