<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin\Billing;

use App\Models\BillingPlan;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SaveBillingPlanRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        /** @var BillingPlan|null $plan */
        $plan = $this->route('plan');

        return [
            'plan_key' => [
                'required',
                'string',
                'max:120',
                'alpha_dash',
                Rule::unique('billing_plans', 'plan_key')->ignore($plan?->id),
            ],
            'label' => ['required', 'string', 'max:255'],
            'seat_limit' => ['required', 'integer', 'min:1', 'max:100000'],
            'monthly_amount' => ['required', 'integer', 'min:0'],
            'annual_amount' => ['required', 'integer', 'min:0'],
            'monthly_price_id' => ['nullable', 'string', 'max:255', 'regex:/^price_[A-Za-z0-9]+$/'],
            'annual_price_id' => ['nullable', 'string', 'max:255', 'regex:/^price_[A-Za-z0-9]+$/'],
            'is_active' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:100000'],
        ];
    }
}
