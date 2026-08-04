<?php

declare(strict_types=1);

namespace App\Http\Requests\FieldActivity;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;

class RecordFieldActivityPointsRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
        ]);
    }

    public function rules(): array
    {
        return [
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'accuracy_meters' => ['nullable', 'numeric', 'min:0'],
            'speed_mps' => ['nullable', 'numeric'],
            'heading_degrees' => ['nullable', 'numeric', 'between:0,360'],
            'recorded_at' => ['nullable', 'date'],
            'task_id' => ['nullable', 'integer', 'exists:tasks,id'],
            'task_tracking_session_id' => ['nullable', 'integer', 'exists:task_tracking_sessions,id'],
            'points' => ['nullable', 'array', 'max:50'],
            'points.*.latitude' => ['required_with:points', 'numeric', 'between:-90,90'],
            'points.*.longitude' => ['required_with:points', 'numeric', 'between:-180,180'],
            'points.*.accuracy_meters' => ['nullable', 'numeric', 'min:0'],
            'points.*.speed_mps' => ['nullable', 'numeric'],
            'points.*.heading_degrees' => ['nullable', 'numeric', 'between:0,360'],
            'points.*.recorded_at' => ['nullable', 'date'],
            'points.*.task_id' => ['nullable', 'integer', 'exists:tasks,id'],
            'points.*.task_tracking_session_id' => ['nullable', 'integer', 'exists:task_tracking_sessions,id'],
        ];
    }
}
