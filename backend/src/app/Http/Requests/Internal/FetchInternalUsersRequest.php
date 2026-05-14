<?php

declare(strict_types=1);

namespace App\Http\Requests\Internal;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class FetchInternalUsersRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            'include_inactive' => $this->boolean('include_inactive'),
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
            'role' => ['nullable', 'string', Rule::in(['supervisor', 'agent'])],
            'onboarding_status' => ['nullable', 'string', Rule::in(['pending_onboarding', 'active'])],
            'include_inactive' => ['nullable', 'boolean'],
        ];
    }
}
