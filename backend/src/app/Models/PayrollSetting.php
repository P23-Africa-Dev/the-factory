<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\PayrollSalaryType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PayrollSetting extends Model
{
    use HasFactory;

    protected $fillable = [
        'company_id',
        'salary_type',
        'base_salary',
        'currency',
        'work_days',
        'work_hours',
        'daily_pay',
        'attendance_affects_pay',
        'commission_enabled',
    ];

    protected function casts(): array
    {
        return [
            'salary_type' => PayrollSalaryType::class,
            'base_salary' => 'decimal:2',
            'daily_pay' => 'decimal:2',
            'work_days' => 'integer',
            'work_hours' => 'integer',
            'attendance_affects_pay' => 'boolean',
            'commission_enabled' => 'boolean',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
