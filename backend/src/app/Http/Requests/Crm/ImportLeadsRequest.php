<?php

declare(strict_types=1);

namespace App\Http\Requests\Crm;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ImportLeadsRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            'duplicate_policy' => strtolower((string) ($this->input('duplicate_policy') ?? 'create')),
        ]);
    }

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'company_id' => ['required', 'integer', 'exists:companies,id'],
            'pipeline_id' => ['required', 'integer'],
            'rows' => ['required', 'array', 'min:1', 'max:500'],
            'rows.*' => ['array'],
            'duplicate_policy' => ['required', Rule::in(['create', 'skip', 'update'])],
        ];
    }

    public function messages(): array
    {
        return [
            'rows.max' => 'Imports are limited to 500 rows per file. Split the file and try again.',
        ];
    }
}
