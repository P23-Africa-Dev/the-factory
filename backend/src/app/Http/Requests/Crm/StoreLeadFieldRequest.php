<?php

declare(strict_types=1);

namespace App\Http\Requests\Crm;

use App\Enums\LeadFieldType;
use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreLeadFieldRequest extends FormRequest
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
            'label' => ['required', 'string', 'max:80'],
            'description' => ['nullable', 'string', 'max:255'],
            'type' => ['required', 'string', Rule::in(LeadFieldType::values())],
            'options' => ['nullable', 'array', 'max:100'],
            'options.*' => ['nullable'],
            'is_required' => ['sometimes', 'boolean'],
            'show_on_create' => ['sometimes', 'boolean'],
            'show_in_list' => ['sometimes', 'boolean'],
        ];
    }
}
