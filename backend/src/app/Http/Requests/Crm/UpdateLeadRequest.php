<?php

declare(strict_types=1);

namespace App\Http\Requests\Crm;

use App\Enums\LeadPriority;
use App\Http\Requests\Concerns\NormalizesLeadProfessionalFields;
use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;

class UpdateLeadRequest extends FormRequest
{
    use NormalizesLeadProfessionalFields;
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $budget = $this->normalizeBudgetInput();

        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            ...$budget,
            ...$this->normalizeLeadProfessionalFields(),
        ]);
    }

    /**
     * @return array{budget_amount?: float|null, budget_currency?: string|null}
     */
    private function normalizeBudgetInput(): array
    {
        if (! $this->has('budget_amount') && ! $this->has('budget_currency') && ! $this->has('budget')) {
            return [];
        }

        if ($this->has('budget_amount') || $this->has('budget_currency')) {
            $amount = $this->input('budget_amount');
            $currency = $this->input('budget_currency');

            return [
                'budget_amount' => $amount !== null && $amount !== '' ? (float) $amount : null,
                'budget_currency' => is_string($currency) && $currency !== ''
                    ? strtoupper(trim($currency))
                    : null,
            ];
        }

        $legacyBudget = trim((string) $this->input('budget', ''));
        if ($legacyBudget === '') {
            return [
                'budget_amount' => null,
                'budget_currency' => null,
            ];
        }

        if (preg_match('/^([A-Z]{3})\s+([\d.,]+)$/', $legacyBudget, $matches) === 1) {
            return [
                'budget_amount' => (float) str_replace(',', '', $matches[2]),
                'budget_currency' => $matches[1],
            ];
        }

        if (is_numeric(str_replace(',', '', $legacyBudget))) {
            return [
                'budget_amount' => (float) str_replace(',', '', $legacyBudget),
                'budget_currency' => null,
            ];
        }

        return [];
    }

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'pipeline_id' => ['sometimes', 'required', 'integer', 'exists:lead_pipelines,id'],
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:40'],
            'location' => ['sometimes', 'nullable', 'string', 'max:255'],
            'company_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'website' => ['sometimes', 'nullable', 'string', 'max:255', 'url'],
            'position' => ['sometimes', 'nullable', 'string', 'max:120'],
            'profile_urls' => ['sometimes', 'nullable', 'array'],
            'profile_urls.*' => ['sometimes', 'nullable', 'string', 'url', 'max:2048'],
            'source' => ['sometimes', 'nullable', 'string', 'max:120'],
            'status' => ['sometimes', 'required', 'string', 'max:120'],
            'priority' => ['sometimes', 'required', 'string', \Illuminate\Validation\Rule::in(LeadPriority::values())],
            'budget_amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'budget_currency' => ['sometimes', 'nullable', 'string', 'size:3', 'regex:/^[A-Z]{3}$/'],
            'budget' => ['sometimes', 'nullable', 'string', 'max:64'],
            'next_action' => ['sometimes', 'nullable', 'string', 'max:255'],
            'last_interaction' => ['sometimes', 'nullable', 'string', 'max:255'],
            'last_interaction_at' => ['sometimes', 'nullable', 'date'],
            'assigned_to_user_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'meta' => ['sometimes', 'nullable', 'array'],
            'converted_at' => ['sometimes', 'nullable', 'date'],
        ];
    }
}
