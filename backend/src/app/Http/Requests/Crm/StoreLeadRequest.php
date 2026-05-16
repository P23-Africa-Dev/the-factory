<?php

declare(strict_types=1);

namespace App\Http\Requests\Crm;

use App\Enums\LeadPriority;
use App\Enums\LeadStatus;
use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreLeadRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            'status' => $this->input('status', LeadStatus::NEW->value),
            'priority' => $this->input('priority', LeadPriority::MEDIUM->value),
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
            'name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:40'],
            'location' => ['nullable', 'string', 'max:255'],
            'source' => ['nullable', 'string', 'max:120'],
            'status' => ['required', 'string', Rule::in(LeadStatus::values())],
            'priority' => ['required', 'string', Rule::in(LeadPriority::values())],
            'next_action' => ['nullable', 'string', 'max:255'],
            'last_interaction' => ['nullable', 'string', 'max:255'],
            'last_interaction_at' => ['nullable', 'date'],
            'assigned_to_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'meta' => ['nullable', 'array'],
        ];
    }
}
