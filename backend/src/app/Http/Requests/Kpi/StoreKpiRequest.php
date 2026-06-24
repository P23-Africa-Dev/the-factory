<?php

declare(strict_types=1);

namespace App\Http\Requests\Kpi;

use App\Enums\KpiCategory;
use App\Enums\KpiPriority;
use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreKpiRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $assignedTo = $this->input('assigned_to_user_id', $this->input('assigned_to'));

        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            'assigned_to_user_id' => $assignedTo !== null && $assignedTo !== '' ? (int) $assignedTo : null,
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
            'name' => ['required', 'string', 'min:3', 'max:255'],
            'category' => ['required', 'string', Rule::in(KpiCategory::values())],
            'objective' => ['required', 'string', 'min:10', 'max:5000'],
            'target_value' => ['required', 'string', 'max:255'],
            'expected_outcome' => ['required', 'string', 'min:10', 'max:5000'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'priority' => ['required', 'string', Rule::in(KpiPriority::values())],
            'assigned_to_user_id' => ['nullable', 'integer', 'exists:users,id'],
        ];
    }
}
