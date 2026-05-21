<?php

declare(strict_types=1);

namespace App\Http\Requests\Notification;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;

class UpsertPushSubscriptionRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            'user_agent' => $this->input('user_agent') ?: $this->userAgent(),
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
            'provider' => ['nullable', 'string', 'max:64'],
            'platform' => ['nullable', 'string', 'max:64'],
            'device_token' => ['required', 'string', 'max:2048'],
            'endpoint' => ['nullable', 'string', 'max:2048'],
            'subscription_payload' => ['nullable', 'array'],
            'user_agent' => ['nullable', 'string', 'max:5000'],
            'is_active' => ['nullable', 'boolean'],
        ];
    }
}
