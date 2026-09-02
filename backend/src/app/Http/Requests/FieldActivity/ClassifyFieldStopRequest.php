<?php

declare(strict_types=1);

namespace App\Http\Requests\FieldActivity;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ClassifyFieldStopRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
        ]);
    }

    public function rules(): array
    {
        return [
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'classification' => [
                'required',
                'string',
                Rule::in(['customer_visit', 'lead_visit', 'org_visit', 'personal', 'ignore']),
            ],
            'lead_id' => ['nullable', 'integer', 'exists:leads,id'],
            'company_location_id' => ['nullable', 'integer', 'exists:company_locations,id'],
            'note' => ['nullable', 'string', 'max:1000'],
            'source' => ['nullable', 'string', Rule::in(['agent', 'reminder'])],
        ];
    }
}
