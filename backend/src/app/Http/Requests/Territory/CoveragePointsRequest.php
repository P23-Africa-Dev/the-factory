<?php

declare(strict_types=1);

namespace App\Http\Requests\Territory;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;

class CoveragePointsRequest extends FormRequest
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
            'user_ids' => ['nullable', 'array', 'max:100'],
            'user_ids.*' => ['integer', 'exists:users,id'],
        ];
    }
}
