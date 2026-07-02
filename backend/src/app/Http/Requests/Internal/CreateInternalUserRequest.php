<?php

declare(strict_types=1);

namespace App\Http\Requests\Internal;

use App\Enums\PayrollSalaryType;
use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use App\Support\CurrencyCatalog;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CreateInternalUserRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            'salary_type' => $this->input('salary_type') !== null ? strtolower((string) $this->input('salary_type')) : null,
            'currency_code' => $this->filled('currency_code') ? strtoupper((string) $this->input('currency_code')) : null,
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
            'email' => ['required', 'string', 'email:rfc', 'max:255', Rule::unique('users', 'email')->whereNull('deleted_at')],
            'role' => ['required', 'string', Rule::in(['admin', 'supervisor', 'agent'])],
            'phone_number' => ['nullable', 'string', 'regex:/^\+[1-9][0-9]{7,14}$/'],
            'gender' => ['nullable', 'string', Rule::in(['male', 'female'])],
            'avatar_key' => ['nullable', 'string', 'max:50'],
            'assigned_zone' => ['nullable', 'string', 'min:2', 'max:120'],
            'work_days' => ['required', 'array', 'min:1', 'max:7'],
            'work_days.*' => ['string', Rule::in(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])],
            'base_salary' => ['required', 'numeric', 'min:0'],
            'salary_type' => ['nullable', 'string', Rule::in(PayrollSalaryType::values())],
            'currency_code' => ['nullable', 'string', 'size:3', Rule::in(CurrencyCatalog::codes())],
            'commission_enabled' => ['nullable', 'boolean'],
            'supervisor_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'assign_agent_ids' => ['nullable', 'array', 'max:100'],
            'assign_agent_ids.*' => ['integer', 'exists:users,id'],
        ];
    }
}
