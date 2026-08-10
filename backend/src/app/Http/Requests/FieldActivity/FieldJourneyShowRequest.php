<?php

declare(strict_types=1);

namespace App\Http\Requests\FieldActivity;

use App\Http\Requests\Concerns\NormalizesQueryBooleans;
use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;

class FieldJourneyShowRequest extends FormRequest
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
        ]);
    }

    public function rules(): array
    {
        return [
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'include_route' => ['nullable', 'boolean'],
            'include_timeline' => ['nullable', 'boolean'],
        ];
    }
}
