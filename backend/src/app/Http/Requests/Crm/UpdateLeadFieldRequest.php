<?php

declare(strict_types=1);

namespace App\Http\Requests\Crm;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;

class UpdateLeadFieldRequest extends FormRequest
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
            'label' => ['sometimes', 'required', 'string', 'max:80'],
            'description' => ['sometimes', 'nullable', 'string', 'max:255'],
            'options' => ['sometimes', 'nullable', 'array', 'max:100'],
            'options.*' => ['nullable'],
            'is_required' => ['sometimes', 'boolean'],
            'show_on_create' => ['sometimes', 'boolean'],
            'show_in_list' => ['sometimes', 'boolean'],
        ];
    }
}
