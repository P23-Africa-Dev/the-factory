<?php

declare(strict_types=1);

namespace App\Http\Requests\Project;

use App\Enums\ProjectPriority;
use App\Enums\ProjectStatus;
use App\Enums\ProjectType;
use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateProjectRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $payload = [
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
        ];

        if ($this->filled('project_manager') && ! $this->has('project_manager_user_id')) {
            $payload['project_manager_user_id'] = $this->input('project_manager');
        }

        $this->merge($payload);
    }

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'name' => ['sometimes', 'required', 'string', 'min:3', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'type' => ['sometimes', 'nullable', 'string', Rule::in(ProjectType::values())],
            'status' => ['sometimes', 'required', 'string', Rule::in(ProjectStatus::values())],
            'priority' => ['sometimes', 'nullable', 'string', Rule::in(ProjectPriority::values())],
            'start_date' => ['sometimes', 'required', 'date'],
            'end_date' => ['sometimes', 'nullable', 'date', 'after_or_equal:start_date'],
            'project_manager_user_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'assigned_team' => ['sometimes', 'nullable', 'array', 'max:100'],
            'assigned_team.*' => ['integer', 'distinct', 'exists:users,id'],
            'territory_zone' => ['sometimes', 'nullable', 'string', 'max:255'],
            'attachments' => ['sometimes', 'nullable', 'array', 'max:10'],
            'attachments.*' => ['file', 'mimes:jpg,jpeg,png,webp,pdf,doc,docx,xls,xlsx,csv', 'max:10240'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:5000'],
        ];
    }
}
