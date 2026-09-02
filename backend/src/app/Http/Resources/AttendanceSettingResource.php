<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AttendanceSettingResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'company_id' => $this->company_id,
            'opening_time' => $this->opening_time,
            'closing_time' => $this->closing_time,
            'working_days' => $this->working_days ?? [],
            'clockin_window_minutes' => (int) $this->clockin_window_minutes,
            'auto_clockout_enabled' => (bool) $this->auto_clockout_enabled,
            'timezone' => $this->timezone,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
