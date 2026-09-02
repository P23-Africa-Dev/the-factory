<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Support\AvatarUrlResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AttendancePayrollSummaryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'company_id' => $this->company_id,
            'user_id' => $this->user_id,
            'agent' => $this->whenLoaded('user', fn() => [
                'id' => $this->user?->id,
                'name' => $this->user?->name,
                'avatar' => $this->user?->avatar,
                'avatar_url' => AvatarUrlResolver::resolveOrDefault(
                    $this->user?->avatar,
                    $this->user?->gender,
                ),
            ]),
            'period_year' => (int) $this->period_year,
            'period_month' => (int) $this->period_month,
            'period_start' => $this->period_start?->toDateString(),
            'period_end' => $this->period_end?->toDateString(),
            'attendance_days' => (int) $this->attendance_days,
            'scheduled_work_days' => (int) $this->scheduled_work_days,
            'daily_rate' => (float) $this->daily_rate,
            'salary_payable' => (float) $this->salary_payable,
            'currency' => $this->currency,
            'generated_at' => $this->generated_at?->toIso8601String(),
            'metadata' => $this->metadata,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
