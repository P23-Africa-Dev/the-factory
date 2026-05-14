<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PayrollSettingResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'company_id' => $this->company_id,
            'salary_type' => $this->salary_type?->value,
            'base_salary' => round((float) $this->base_salary, 2),
            'currency' => $this->currency,
            'work_days' => $this->work_days,
            'work_hours' => $this->work_hours,
            'daily_pay' => round((float) $this->daily_pay, 2),
            'attendance_affects_pay' => (bool) $this->attendance_affects_pay,
            'commission_enabled' => (bool) $this->commission_enabled,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
