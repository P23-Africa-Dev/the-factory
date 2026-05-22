<?php

declare(strict_types=1);

namespace App\Http\Requests\Notification;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;

class ListNotificationsRequest extends FormRequest
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
            'is_read' => ['nullable', 'boolean'],
            'category' => ['nullable', 'string', 'max:64'],
            'type' => ['nullable', 'string', 'max:128'],
            'priority' => ['nullable', 'in:low,normal,high,critical'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ];
    }
}
