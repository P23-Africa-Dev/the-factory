<?php

declare(strict_types=1);

namespace App\Http\Requests\Payroll;

use App\Enums\PayrollSalaryType;
use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePayrollRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $payload = [
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
        ];

        if ($this->has('work_days')) {
            $payload['work_days'] = $this->input('work_days');
        }

        if ($this->has('work_hours')) {
            $payload['work_hours'] = $this->input('work_hours');
        }

        if ($this->has('attendance_affects_pay')) {
            $payload['attendance_affects_pay'] = $this->boolean('attendance_affects_pay');
        }

        if ($this->has('commission_enabled')) {
            $payload['commission_enabled'] = $this->boolean('commission_enabled');
        }

        if ($this->has('currency')) {
            $payload['currency'] = $this->filled('currency')
                ? strtoupper((string) $this->input('currency'))
                : null;
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
            'salary_type' => ['sometimes', 'required', 'string', Rule::in(PayrollSalaryType::values())],
            'base_salary' => ['sometimes', 'required', 'numeric', 'gt:0'],
            'currency' => ['sometimes', 'nullable', 'string', 'size:3', 'regex:/^[A-Z]{3}$/'],
            'work_days' => ['sometimes', 'required', 'integer', 'gt:0', 'max:31'],
            'work_hours' => ['sometimes', 'required', 'integer', 'between:4,12'],
            'attendance_affects_pay' => ['sometimes', 'boolean'],
            'commission_enabled' => ['sometimes', 'boolean'],
        ];
    }
}
