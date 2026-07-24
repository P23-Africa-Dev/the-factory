<?php

declare(strict_types=1);

namespace App\Http\Requests\Crm;

use App\Enums\LeadPriority;
use App\Http\Requests\Concerns\NormalizesLeadProfessionalFields;
use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;

class StoreLeadRequest extends FormRequest
{
    use NormalizesLeadProfessionalFields;
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $budget = $this->normalizeBudgetInput();

        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            'status' => $this->input('status', 'newly_lead'),
            'priority' => $this->input('priority', LeadPriority::MEDIUM->value),
            ...$budget,
            ...$this->normalizeLeadProfessionalFields(),
        ]);
    }

    /**
     * @return array{budget_amount?: float|null, budget_currency?: string|null}
     */
    private function normalizeBudgetInput(): array
    {
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
            return [];
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
            'company_id' => ['required', 'integer', 'exists:companies,id'],
            'pipeline_id' => ['nullable', 'integer', 'exists:lead_pipelines,id'],
            'name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:40'],
            'location' => ['nullable', 'string', 'max:255'],
            'company_name' => ['nullable', 'string', 'max:255'],
            'website' => ['nullable', 'string', 'max:255', 'url'],
            'position' => ['nullable', 'string', 'max:120'],
            'profile_urls' => ['nullable', 'array'],
            'profile_urls.*' => ['nullable', 'string', 'url', 'max:2048'],
            'source' => ['nullable', 'string', 'max:120'],
            'status' => ['required', 'string', 'max:120'],
            'priority' => ['required', 'string', \Illuminate\Validation\Rule::in(LeadPriority::values())],
            'budget_amount' => ['nullable', 'numeric', 'min:0'],
            'budget_currency' => ['nullable', 'string', 'size:3', 'regex:/^[A-Z]{3}$/'],
            'budget' => ['nullable', 'string', 'max:64'],
            'next_action' => ['nullable', 'string', 'max:255'],
            'last_interaction' => ['nullable', 'string', 'max:255'],
            'last_interaction_at' => ['nullable', 'date'],
            'assigned_to_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'meta' => ['nullable', 'array'],
        ];
    }
}
