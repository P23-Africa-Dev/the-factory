<?php

namespace App\Http\Requests\Enterprise;

use App\Enums\BillingInterval;
use App\Enums\TeamSizeEnum;
use App\Enums\UserTypeEnum;
use App\Enums\WorkspacePurposeEnum;
use App\Support\Billing\BillingPlanCatalog;
use App\Support\CountryCatalog;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreDirectRegistrationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('country')) {
            $resolved = CountryCatalog::resolveName((string) $this->input('country'));

            if ($resolved !== null) {
                $this->merge(['country' => $resolved]);
            }
        }

        if ($this->has('already_paid')) {
            $this->merge([
                'already_paid' => filter_var($this->input('already_paid'), FILTER_VALIDATE_BOOLEAN),
            ]);
        }
    }

    public function rules(): array
    {
        $alreadyPaid = (bool) $this->boolean('already_paid');

        return [
            'action' => ['nullable', 'string', Rule::in(['draft', 'provision', 'activate'])],
            'full_name' => ['required', 'string', 'min:2', 'max:255'],
            'email' => ['required', 'string', 'email:rfc', 'max:255'],
            'phone' => ['nullable', 'string', 'regex:/^\+[1-9][0-9]{7,14}$/'],
            'company_name' => ['required', 'string', 'min:2', 'max:255'],
            'country' => ['required', 'string', 'min:2', 'max:100', Rule::in(array_values(CountryCatalog::names()))],
            'team_size' => ['required', 'string', Rule::in(TeamSizeEnum::values())],
            'purpose' => ['required', 'string', Rule::in(WorkspacePurposeEnum::values())],
            'user_type' => ['required', 'string', Rule::in(UserTypeEnum::values())],
            'admin_notes' => ['nullable', 'string', 'max:2000'],
            'assigned_plan_key' => [
                Rule::requiredIf($alreadyPaid),
                'nullable',
                'string',
                Rule::in(BillingPlanCatalog::keys()),
            ],
            'assigned_billing_interval' => [
                Rule::requiredIf($alreadyPaid),
                'nullable',
                'string',
                Rule::in(BillingInterval::values()),
            ],
            'already_paid' => ['nullable', 'boolean'],
            'payment_start_date' => [
                Rule::requiredIf($alreadyPaid),
                'nullable',
                'date',
            ],
        ];
    }
}
