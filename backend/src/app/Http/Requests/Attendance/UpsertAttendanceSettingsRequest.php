<?php

declare(strict_types=1);

namespace App\Http\Requests\Attendance;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpsertAttendanceSettingsRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $workingDays = $this->input('working_days');

        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            'working_days' => is_array($workingDays)
                ? array_values(array_unique(array_map(static fn(mixed $day): string => strtolower(trim((string) $day)), $workingDays)))
                : $workingDays,
        ]);
    }

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'opening_time' => ['required', 'date_format:H:i'],
            'closing_time' => ['required', 'date_format:H:i'],
            'working_days' => ['required', 'array', 'min:1', 'max:7'],
            'working_days.*' => [
                'required',
                'string',
                Rule::in(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
            ],
            'clockin_window_minutes' => ['nullable', 'integer', 'min:0', 'max:240'],
            'auto_clockout_enabled' => ['nullable', 'boolean'],
            'timezone' => ['nullable', 'string', 'max:64', 'timezone'],
        ];
    }
}
