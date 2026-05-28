<?php

declare(strict_types=1);

namespace App\Http\Requests\Payroll;

use App\Enums\PayrollSalaryType;
use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use App\Support\CurrencyCatalog;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateAgentPayrollRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $payload = [
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
        ];

        if ($this->has('attendance_affects_pay')) {
            $payload['attendance_affects_pay'] = $this->boolean('attendance_affects_pay');
        }

        if ($this->has('salary_type')) {
            $payload['salary_type'] = strtolower((string) $this->input('salary_type'));
        }

        if ($this->has('currency_code')) {
            $payload['currency_code'] = $this->filled('currency_code')
                ? strtoupper((string) $this->input('currency_code'))
                : null;
        }

        if ($this->has('work_days_override')) {
            $payload['work_days_override'] = $this->input('work_days_override');
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
            'company_id' => ['required', 'integer', 'exists:companies,id'],
            'base_salary' => ['sometimes', 'required', 'numeric', 'gt:0'],
            'salary_type' => ['sometimes', 'required', 'string', Rule::in(PayrollSalaryType::values())],
            'currency_code' => ['sometimes', 'nullable', 'string', 'size:3', Rule::in(CurrencyCatalog::codes())],
            'attendance_affects_pay' => ['sometimes', 'boolean'],
            'work_days_override' => ['nullable', 'integer', 'min:1', 'max:31'],
        ];
    }
}
