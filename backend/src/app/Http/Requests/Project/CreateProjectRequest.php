<?php

declare(strict_types=1);

namespace App\Http\Requests\Project;

use App\Enums\ProjectPriority;
use App\Enums\ProjectStatus;
use App\Enums\ProjectType;
use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CreateProjectRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $projectManagerUserId = $this->input('project_manager_user_id');

        if ($projectManagerUserId === null && $this->filled('project_manager')) {
            $projectManagerUserId = $this->input('project_manager');
        }

        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            'project_manager_user_id' => $projectManagerUserId,
            'status' => $this->input('status', 'planning'),
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
            'name' => ['required', 'string', 'min:3', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'type' => ['nullable', 'string', Rule::in(ProjectType::values())],
            'status' => ['required', 'string', Rule::in(ProjectStatus::values())],
            'priority' => ['nullable', 'string', Rule::in(ProjectPriority::values())],
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'project_manager_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'assigned_team' => ['nullable', 'array', 'max:100'],
            'assigned_team.*' => ['integer', 'distinct', 'exists:users,id'],
            'territory_zone' => ['nullable', 'string', 'max:255'],
            'attachments' => ['nullable', 'array', 'max:10'],
            'attachments.*' => ['file', 'mimes:jpg,jpeg,png,webp,pdf,doc,docx,xls,xlsx,csv', 'max:10240'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ];
    }

    public function messages(): array
    {
        return [
            'company_id.required' => 'Company context is required to create a project.',
        ];
    }
}
