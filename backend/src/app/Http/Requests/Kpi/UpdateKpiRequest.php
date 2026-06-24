<?php

declare(strict_types=1);

namespace App\Http\Requests\Kpi;

use App\Enums\KpiCategory;
use App\Enums\KpiPriority;
use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateKpiRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $assignedTo = $this->input('assigned_to_user_id', $this->input('assigned_to'));

        $merge = [
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
        ];

        if ($this->has('assigned_to_user_id') || $this->has('assigned_to')) {
            $merge['assigned_to_user_id'] = $assignedTo !== null && $assignedTo !== '' ? (int) $assignedTo : null;
        }

        $this->merge($merge);
    }

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'company_id' => ['required', 'integer', 'exists:companies,id'],
            'name' => ['sometimes', 'required', 'string', 'min:3', 'max:255'],
            'category' => ['sometimes', 'required', 'string', Rule::in(KpiCategory::values())],
            'objective' => ['sometimes', 'required', 'string', 'min:10', 'max:5000'],
            'target_value' => ['sometimes', 'required', 'string', 'max:255'],
            'expected_outcome' => ['sometimes', 'required', 'string', 'min:10', 'max:5000'],
            'start_date' => ['sometimes', 'required', 'date'],
            'end_date' => ['sometimes', 'required', 'date', 'after_or_equal:start_date'],
            'priority' => ['sometimes', 'required', 'string', Rule::in(KpiPriority::values())],
            'assigned_to_user_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
        ];
    }
}
