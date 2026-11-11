<?php

declare(strict_types=1);

namespace App\Http\Requests\Task;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdateTaskSubtaskRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $payload = [
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
        ];

        if ($this->has('title') && is_string($this->input('title'))) {
            $payload['title'] = trim((string) $this->input('title'));
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
            'title' => ['sometimes', 'required', 'string', 'min:1', 'max:255'],
            'assigned_user_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'due_at' => ['sometimes', 'nullable', 'date'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if (! $this->hasAny(['title', 'assigned_user_id', 'due_at'])) {
                $validator->errors()->add('subtask', 'At least one updatable field is required.');
            }
        });
    }
}
