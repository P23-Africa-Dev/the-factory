<?php

declare(strict_types=1);

namespace App\Http\Requests\Territory;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;

class UpsertTerritoryRequest extends FormRequest
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
            'name' => ['nullable', 'string', 'max:120'],
            'color' => ['nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/'],
            'is_visible' => ['nullable', 'boolean'],
            'geojson' => ['nullable', 'array'],
            'geojson.type' => ['required_with:geojson', 'string', 'in:Polygon'],
            'geojson.coordinates' => ['required_with:geojson', 'array', 'min:1'],
        ];
    }
}
