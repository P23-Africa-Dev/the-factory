<?php

declare(strict_types=1);

namespace App\Http\Requests\Billing;

use App\Enums\BillingInterval;
use App\Support\Billing\BillingPlanCatalog;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CreateCheckoutRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'plan_key' => ['required', 'string', Rule::in(BillingPlanCatalog::keys())],
            'interval' => ['required', 'string', Rule::in(BillingInterval::values())],
            'context' => ['nullable', 'string', Rule::in(['onboarding', 'renewal'])],
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
        ];
    }
}
