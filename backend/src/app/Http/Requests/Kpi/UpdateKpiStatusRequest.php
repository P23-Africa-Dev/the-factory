<?php

declare(strict_types=1);

namespace App\Http\Requests\Kpi;

use App\Enums\KpiStatus;
use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateKpiStatusRequest extends FormRequest
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
            'status' => ['required', 'string', Rule::in(KpiStatus::values())],
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
        ];
    }
}
