<?php

declare(strict_types=1);

namespace App\Http\Requests\Task;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;

class AssignTaskRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $payload = [
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
        ];

        // Normalize: if a single assigned_agent_id is given, wrap it in array format
        if ($this->has('assigned_agent_id') && ! $this->has('assigned_agent_ids')) {
            $id = $this->input('assigned_agent_id');
            if ($id !== null) {
                $payload['assigned_agent_ids'] = [$id];
            }
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
            'assigned_agent_id' => ['nullable', 'integer', 'exists:users,id'],
            'assigned_agent_ids' => ['required_without:assigned_agent_id', 'array', 'min:1', 'max:20'],
            'assigned_agent_ids.*' => ['integer', 'distinct', 'exists:users,id'],
        ];
    }

    public function messages(): array
    {
        return [
            'assigned_agent_ids.required_without' => 'At least one agent must be assigned.',
        ];
    }
}
