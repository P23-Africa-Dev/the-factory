<?php

declare(strict_types=1);

namespace App\Http\Requests\Notification;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;

class UpdateNotificationPreferencesRequest extends FormRequest
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
            'preferences' => ['required', 'array', 'min:1'],
            'preferences.*.category' => ['required', 'string', 'max:64'],
            'preferences.*.is_enabled' => ['nullable', 'boolean'],
            'preferences.*.in_app_enabled' => ['nullable', 'boolean'],
            'preferences.*.push_enabled' => ['nullable', 'boolean'],
            'preferences.*.email_enabled' => ['nullable', 'boolean'],
            'preferences.*.muted_until' => ['nullable', 'date'],
            'preferences.*.quiet_hours' => ['nullable', 'array'],
            'preferences.*.digest_mode' => ['nullable', 'string', 'max:64'],
        ];
    }
}
