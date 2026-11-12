<?php

declare(strict_types=1);

namespace App\Http\Requests\Task;

use App\Enums\TaskPriority;
use App\Enums\TaskType;
use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class CreateTaskRequest extends FormRequest
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
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'title' => ['required', 'string', 'min:3', 'max:255'],
            'type' => ['nullable', 'string', Rule::in(TaskType::values())],
            'description' => ['required', 'string', 'min:10', 'max:5000'],
            'assigned_agent_id' => ['nullable', 'integer', 'exists:users,id'],
            'location' => ['nullable', 'string', 'min:2', 'max:255'],
            'address' => ['nullable', 'string', 'min:5', 'max:1000'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'due_date' => ['nullable', 'date', 'after:now'],
            'required_actions' => ['nullable', 'array', 'max:20'],
            'required_actions.*' => ['string', 'max:255'],
            'priority' => ['nullable', 'string', Rule::in(TaskPriority::values())],
            'minimum_photos_required' => ['nullable', 'integer', 'min:0', 'max:20'],
            'visit_verification_required' => ['nullable', 'boolean'],
            'subtasks' => ['nullable', 'array', 'max:50'],
            'subtasks.*.title' => ['required', 'string', 'min:1', 'max:255'],
            'subtasks.*.assigned_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'subtasks.*.due_at' => ['nullable', 'date'],
        ];
    }

    public function messages(): array
    {
        return [
            'company_id.required' => 'Company context is required to create a task.',
            'description.required' => 'Task description is required.',
            'description.min' => 'Task description must be at least 10 characters.',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $latitude = $this->input('latitude');
            $longitude = $this->input('longitude');
            $hasLatitude = $latitude !== null && $latitude !== '';
            $hasLongitude = $longitude !== null && $longitude !== '';

            if ($hasLatitude xor $hasLongitude) {
                $validator->errors()->add('latitude', 'Latitude and longitude must be provided together.');
            }

            if ($this->boolean('visit_verification_required') && ! ($hasLatitude && $hasLongitude)) {
                $validator->errors()->add(
                    'visit_verification_required',
                    'Visit verification requires a task destination location.',
                );
            }

            $taskDue = $this->input('due_date');
            $subtasks = $this->input('subtasks');
            if (is_array($subtasks) && $taskDue) {
                $taskDueAt = strtotime((string) $taskDue);
                foreach ($subtasks as $index => $subtask) {
                    $dueAt = is_array($subtask) ? ($subtask['due_at'] ?? null) : null;
                    if ($dueAt && $taskDueAt !== false && strtotime((string) $dueAt) > $taskDueAt) {
                        $validator->errors()->add(
                            "subtasks.{$index}.due_at",
                            'The task due date cannot be earlier than a subtask due date.',
                        );
                    }
                }
            }
        });
    }
}
