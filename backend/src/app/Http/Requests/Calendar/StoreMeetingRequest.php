<?php

declare(strict_types=1);

namespace App\Http\Requests\Calendar;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreMeetingRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            'source_page' => $this->input('source_page', 'api'),
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
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'task_id' => ['nullable', 'integer', 'exists:tasks,id'],
            'title' => ['required', 'string', 'min:3', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'location' => ['nullable', 'string', 'max:255'],
            'timezone' => ['required', 'string', 'max:64'],
            'start_at' => ['required', 'date'],
            'end_at' => ['required', 'date', 'after:start_at'],
            'source_page' => ['required', 'string', Rule::in(['dashboard', 'operations', 'project', 'task', 'api'])],
            'meeting_settings' => ['nullable', 'array'],
            'reminders' => ['nullable', 'array', 'max:20'],
            'reminders.*.offset_minutes' => ['nullable', 'integer', 'min:1'],
            'reminders.*.remind_at' => ['nullable', 'date'],
            'attendees' => ['nullable', 'array', 'max:100'],
            'attendees.*.email' => ['required', 'email', 'max:255'],
            'attendees.*.display_name' => ['nullable', 'string', 'max:255'],
            'attendees.*.user_id' => ['nullable', 'integer', 'exists:users,id'],
            'attendees.*.is_optional' => ['nullable', 'boolean'],
        ];
    }
}
