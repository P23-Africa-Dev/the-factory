<?php

declare(strict_types=1);

namespace App\Http\Requests\Notification;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;

class BatchNotificationStateRequest extends FormRequest
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
            'notification_ids' => ['required', 'array', 'min:1', 'max:200'],
            'notification_ids.*' => ['integer', 'distinct', 'exists:app_notifications,id'],
        ];
    }
}
