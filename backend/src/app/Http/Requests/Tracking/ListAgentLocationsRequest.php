<?php

declare(strict_types=1);

namespace App\Http\Requests\Tracking;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;

class ListAgentLocationsRequest extends FormRequest
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
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
            'task_id' => ['nullable', 'integer', 'exists:tasks,id'],
            'include_offline' => ['nullable', 'boolean'],
            'stale_after_seconds' => ['nullable', 'integer', 'min:60', 'max:86400'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:500'],
        ];
    }
}
