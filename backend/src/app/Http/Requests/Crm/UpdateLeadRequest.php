<?php

declare(strict_types=1);

namespace App\Http\Requests\Crm;

use App\Enums\LeadPriority;
use App\Enums\LeadStatus;
use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateLeadRequest extends FormRequest
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
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:40'],
            'location' => ['sometimes', 'nullable', 'string', 'max:255'],
            'source' => ['sometimes', 'nullable', 'string', 'max:120'],
            'status' => ['sometimes', 'required', 'string', Rule::in(LeadStatus::values())],
            'priority' => ['sometimes', 'required', 'string', Rule::in(LeadPriority::values())],
            'next_action' => ['sometimes', 'nullable', 'string', 'max:255'],
            'last_interaction' => ['sometimes', 'nullable', 'string', 'max:255'],
            'last_interaction_at' => ['sometimes', 'nullable', 'date'],
            'assigned_to_user_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'meta' => ['sometimes', 'nullable', 'array'],
            'converted_at' => ['sometimes', 'nullable', 'date'],
        ];
    }
}
