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
        $toUserId = $this->input('to_user_id');

        if ($toUserId === null && $this->has('assigned_agent_id')) {
            $toUserId = $this->input('assigned_agent_id');
        }

        if ($toUserId === null && is_array($this->input('assigned_agent_ids'))) {
            $toUserId = $this->input('assigned_agent_ids')[0] ?? null;
        }

        $payload = [
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            'to_user_id' => $toUserId,
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
            'to_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'assigned_agent_id' => ['nullable', 'integer', 'exists:users,id'],
            'assigned_agent_ids' => ['required_without_all:assigned_agent_id,to_user_id', 'array', 'min:1', 'max:20'],
            'assigned_agent_ids.*' => ['integer', 'distinct', 'exists:users,id'],
            'reason' => ['nullable', 'string', 'min:3', 'max:2000'],
        ];
    }

    public function messages(): array
    {
        return [
            'assigned_agent_ids.required_without_all' => 'A reassignment target is required.',
        ];
    }
}
