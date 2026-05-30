<?php

declare(strict_types=1);

namespace App\Http\Requests\Calendar;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateMeetingRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
        ]);
    }

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'company_id' => ['required', 'integer', 'exists:companies,id'],
            'project_id' => ['sometimes', 'nullable', 'integer', 'exists:projects,id'],
            'task_id' => ['sometimes', 'nullable', 'integer', 'exists:tasks,id'],
            'title' => ['sometimes', 'required', 'string', 'min:3', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'location' => ['sometimes', 'nullable', 'string', 'max:255'],
            'timezone' => ['sometimes', 'required', 'string', 'max:64'],
            'start_at' => ['sometimes', 'required', 'date'],
            'end_at' => ['sometimes', 'required', 'date', 'after:start_at'],
            'status' => ['sometimes', 'required', 'string', Rule::in(['scheduled', 'cancelled', 'completed'])],
            'attendees' => ['sometimes', 'nullable', 'array', 'max:100'],
            'attendees.*.email' => ['required', 'email', 'max:255'],
            'attendees.*.display_name' => ['nullable', 'string', 'max:255'],
            'attendees.*.user_id' => ['nullable', 'integer', 'exists:users,id'],
            'attendees.*.is_optional' => ['nullable', 'boolean'],
        ];
    }
}
