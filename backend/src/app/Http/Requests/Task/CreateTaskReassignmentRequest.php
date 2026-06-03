<?php

declare(strict_types=1);

namespace App\Http\Requests\Task;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;

class CreateTaskReassignmentRequest extends FormRequest
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

        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            'to_user_id' => $toUserId,
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
            'to_user_id' => ['required', 'integer', 'exists:users,id'],
            'reason' => ['nullable', 'string', 'min:3', 'max:2000'],
        ];
    }
}
