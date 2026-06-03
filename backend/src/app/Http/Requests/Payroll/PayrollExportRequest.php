<?php

declare(strict_types=1);

namespace App\Http\Requests\Payroll;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PayrollExportRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $year = $this->input('year') !== null ? (int) $this->input('year') : null;
        $month = $this->input('month') !== null ? (int) $this->input('month') : null;

        if ($this->input('date') === null && $year !== null && $month !== null) {
            $this->merge([
                'date' => sprintf('%04d-%02d-01', $year, $month),
            ]);
        }

        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            'status' => $this->input('status') !== null ? strtolower((string) $this->input('status')) : null,
            'role' => $this->input('role') !== null ? strtolower((string) $this->input('role')) : null,
            'salary_type' => $this->input('salary_type') !== null ? strtolower((string) $this->input('salary_type')) : null,
            'format' => match (strtolower((string) ($this->input('format') ?? 'csv'))) {
                'xls' => 'xlsx',
                default => strtolower((string) ($this->input('format') ?? 'csv')),
            },
            'date' => $this->input('date') ?? now()->toDateString(),
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
            'search' => ['nullable', 'string', 'max:255'],
            'role' => ['nullable', Rule::in(['agent'])],
            'status' => ['nullable', Rule::in(['approved', 'pending', 'revoked'])],
            'salary_type' => ['nullable', Rule::in(['daily', 'weekly', 'monthly'])],
            'attendance_affects_pay' => ['nullable', 'boolean'],
            'attendance_min' => ['nullable', 'integer', 'min:0'],
            'attendance_max' => ['nullable', 'integer', 'min:0', 'gte:attendance_min'],
            'date' => ['required', 'date'],
            'format' => ['required', Rule::in(['csv', 'xlsx'])],
            'year' => ['nullable', 'integer', 'min:2000', 'max:2100'],
            'month' => ['nullable', 'integer', 'min:1', 'max:12'],
        ];
    }
}
