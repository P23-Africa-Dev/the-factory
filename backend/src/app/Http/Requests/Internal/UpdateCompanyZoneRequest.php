<?php

declare(strict_types=1);

namespace App\Http\Requests\Internal;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use App\Support\CountryCatalog;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCompanyZoneRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            'country_code' => $this->filled('country_code') ? strtoupper((string) $this->input('country_code')) : null,
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
            'name' => ['sometimes', 'nullable', 'string', 'min:2', 'max:120'],
            'country_code' => ['sometimes', 'required', 'string', 'size:2', Rule::in(CountryCatalog::codes())],
            'state_name' => ['sometimes', 'required', 'string', 'min:2', 'max:120'],
            'lga_name' => ['sometimes', 'required', 'string', 'min:2', 'max:120'],
            'is_active' => ['sometimes', 'boolean'],
            'meta' => ['sometimes', 'nullable', 'array'],
        ];
    }
}

