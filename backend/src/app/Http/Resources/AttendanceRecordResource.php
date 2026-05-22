<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AttendanceRecordResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'company_id' => $this->company_id,
            'user_id' => $this->user_id,
            'agent_name' => $this->whenLoaded('user', fn() => $this->user?->name),
            'avatar' => $this->whenLoaded('user', fn() => $this->user?->avatar),
            'attendance_date' => $this->attendance_date?->toDateString(),
            'clock_in_at' => $this->clock_in_at?->toIso8601String(),
            'clock_out_at' => $this->clock_out_at?->toIso8601String(),
            'status' => $this->status?->value,
            'work_duration_minutes' => $this->work_duration_minutes,
            'work_duration_hours' => $this->work_duration_minutes !== null
                ? round(((int) $this->work_duration_minutes) / 60, 2)
                : null,
            'is_late' => (bool) $this->is_late,
            'is_auto_clocked_out' => (bool) $this->is_auto_clocked_out,
            'metadata' => $this->metadata,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
