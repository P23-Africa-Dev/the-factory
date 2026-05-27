<?php

declare(strict_types=1);

namespace App\Http\Requests\Payroll;

use App\Enums\PayrollSalaryType;
use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CreatePayrollRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            'work_days' => $this->input('work_days', 22),
            'work_hours' => $this->input('work_hours', 8),
            'salary_type' => $this->input('salary_type') !== null ? strtolower((string) $this->input('salary_type')) : null,
            'attendance_affects_pay' => $this->boolean('attendance_affects_pay'),
            'commission_enabled' => $this->boolean('commission_enabled'),
            'currency' => $this->filled('currency') ? strtoupper((string) $this->input('currency')) : null,
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
            'salary_type' => ['required', 'string', Rule::in(PayrollSalaryType::values())],
            'base_salary' => ['required', 'numeric', 'gt:0'],
            'currency' => ['nullable', 'string', 'size:3', 'regex:/^[A-Z]{3}$/'],
            'work_days' => ['required', 'integer', 'gt:0', 'max:31'],
            'work_hours' => ['required', 'integer', 'between:4,12'],
            'attendance_affects_pay' => ['nullable', 'boolean'],
            'commission_enabled' => ['nullable', 'boolean'],
        ];
    }
}
