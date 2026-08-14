<?php

declare(strict_types=1);

namespace App\Http\Requests\FieldActivity;

use App\Http\Requests\Concerns\NormalizesQueryBooleans;
use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class FieldJourneyListRequest extends FormRequest
{
    use NormalizesQueryBooleans;
    use ResolvesCompanyContextId;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->normalizeBooleanInputs(['include_route', 'include_timeline']);
        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            'preset' => $this->input('preset') !== null
                ? strtolower((string) $this->input('preset'))
                : null,
        ]);
    }

    public function rules(): array
    {
        return [
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'preset' => ['nullable', Rule::in([
                'today',
                'this_week',
                'last_week',
                'last_30_days',
                'last_90_days',
                'custom',
            ])],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:60'],
            'page' => ['nullable', 'integer', 'min:1'],
            'include_route' => ['nullable', 'boolean'],
            'include_timeline' => ['nullable', 'boolean'],
        ];
    }
}
