<?php

declare(strict_types=1);

namespace App\Http\Requests\Internal;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CreateInternalUserRequest extends FormRequest
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
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'full_name' => ['required', 'string', 'min:2', 'max:255'],
            'email' => ['required', 'string', 'email:rfc', 'max:255', 'unique:users,email'],
            'role' => ['required', 'string', Rule::in(['supervisor', 'agent'])],
            'phone_number' => ['nullable', 'string', 'regex:/^\+[1-9][0-9]{7,14}$/'],
            'gender' => ['nullable', 'string', Rule::in(['male', 'female'])],
            'avatar_key' => ['nullable', 'string', 'max:50'],
            'assigned_zone' => ['required', 'string', 'min:2', 'max:120'],
            'work_days' => ['required', 'array', 'min:1', 'max:7'],
            'work_days.*' => ['string', Rule::in(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])],
            'base_salary' => ['required', 'numeric', 'min:0'],
            'currency_code' => ['nullable', 'string', 'size:3', 'regex:/^[A-Za-z]{3}$/'],
            'commission_enabled' => ['nullable', 'boolean'],
            'supervisor_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'assign_agent_ids' => ['nullable', 'array', 'max:100'],
            'assign_agent_ids.*' => ['integer', 'exists:users,id'],
        ];
    }
}
