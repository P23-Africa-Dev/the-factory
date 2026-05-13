<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class UpdateUserRoleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'internal_role' => ['nullable', 'string', 'in:agent,supervisor,manager'],
        ];
    }

    public function messages(): array
    {
        return [
            'internal_role.in' => 'The selected role is invalid. Must be one of: agent, supervisor, manager.',
        ];
    }
}
