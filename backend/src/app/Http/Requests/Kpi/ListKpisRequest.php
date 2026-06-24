<?php

declare(strict_types=1);

namespace App\Http\Requests\Kpi;

use App\Enums\KpiCategory;
use App\Enums\KpiPriority;
use App\Enums\KpiStatus;
use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ListKpisRequest extends FormRequest
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
            'company_id' => ['required', 'integer', 'exists:companies,id'],
            'status' => ['nullable', 'string', Rule::in(KpiStatus::values())],
            'priority' => ['nullable', 'string', Rule::in(KpiPriority::values())],
            'category' => ['nullable', 'string', Rule::in(KpiCategory::values())],
            'assigned_to_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'search' => ['nullable', 'string', 'max:255'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
