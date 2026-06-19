<?php

declare(strict_types=1);

namespace App\Http\Requests\Company;

use App\Enums\CompanyLocationType;
use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCompanyLocationRequest extends FormRequest
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
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'type' => ['sometimes', 'nullable', 'string', Rule::in(CompanyLocationType::values())],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'address' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'latitude' => ['sometimes', 'required', 'numeric', 'between:-90,90'],
            'longitude' => ['sometimes', 'required', 'numeric', 'between:-180,180'],
            'contact_number' => ['sometimes', 'nullable', 'string', 'max:40'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
            'meta' => ['sometimes', 'nullable', 'array'],
        ];
    }
}
