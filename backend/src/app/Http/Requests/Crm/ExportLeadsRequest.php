<?php

declare(strict_types=1);

namespace App\Http\Requests\Crm;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ExportLeadsRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $leadIds = $this->input('lead_ids');
        if (is_string($leadIds) && $leadIds !== '') {
            $leadIds = array_values(array_filter(explode(',', $leadIds), static fn(string $id): bool => trim($id) !== ''));
        }

        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            'format' => match (strtolower((string) ($this->input('format') ?? 'csv'))) {
                'xls' => 'xlsx',
                default => strtolower((string) ($this->input('format') ?? 'csv')),
            },
            'lead_ids' => $leadIds,
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
            'format' => ['required', Rule::in(['csv', 'xlsx'])],
            'search' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', 'string', 'max:120'],
            'priority' => ['nullable', 'string', 'max:20'],
            'pipeline_id' => ['nullable', 'integer'],
            'source' => ['nullable', 'string', 'max:120'],
            'assigned_to_user_id' => ['nullable', 'integer'],
            'lead_ids' => ['nullable', 'array', 'max:1000'],
            'lead_ids.*' => ['integer'],
        ];
    }
}
