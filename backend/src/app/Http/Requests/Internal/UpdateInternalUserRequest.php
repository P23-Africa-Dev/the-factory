<?php

declare(strict_types=1);

namespace App\Http\Requests\Internal;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateInternalUserRequest extends FormRequest
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
            'company_id'   => ['nullable', 'integer', 'exists:companies,id'],
            'full_name'    => ['sometimes', 'string', 'min:2', 'max:255'],
            'role'         => ['sometimes', 'string', Rule::in(['admin', 'supervisor', 'agent'])],
            'phone_number' => ['sometimes', 'nullable', 'string', 'regex:/^\+[1-9][0-9]{7,14}$/'],
            'assigned_zone'=> ['sometimes', 'nullable', 'string', 'min:2', 'max:120'],
            'assigned_zone_ids' => ['sometimes', 'nullable', 'array', 'max:50'],
            'assigned_zone_ids.*' => ['integer', 'exists:company_zones,id'],
        ];
    }
}
