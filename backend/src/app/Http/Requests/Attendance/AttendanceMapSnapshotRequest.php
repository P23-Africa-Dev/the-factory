<?php

declare(strict_types=1);

namespace App\Http\Requests\Attendance;

class AttendanceMapSnapshotRequest extends AttendanceMetricsRequest
{
    public function rules(): array
    {
        return [
            ...parent::rules(),
            'include_clocked_out' => ['nullable', 'boolean'],
        ];
    }
}
