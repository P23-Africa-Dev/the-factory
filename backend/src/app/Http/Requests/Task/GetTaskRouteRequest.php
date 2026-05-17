<?php

declare(strict_types=1);

namespace App\Http\Requests\Task;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;

class GetTaskRouteRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $normalizedIncludePoints = $this->normalizeIncludePoints($this->input('include_points'));

        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            'include_points' => $normalizedIncludePoints,
        ]);
    }

    private function normalizeIncludePoints(mixed $value): mixed
    {
        if ($value === null || is_bool($value)) {
            return $value;
        }

        if (is_int($value) || is_float($value)) {
            return in_array((int) $value, [0, 1], true) ? (bool) $value : $value;
        }

        if (! is_string($value)) {
            return $value;
        }

        $normalized = strtolower(trim($value));

        if ($normalized === '' || $normalized === 'null' || $normalized === 'undefined') {
            return null;
        }

        if (in_array($normalized, ['1', 'true', 'yes', 'on', 'all'], true)) {
            return true;
        }

        if (in_array($normalized, ['0', 'false', 'no', 'off', 'online'], true)) {
            return false;
        }

        return $value;
    }

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'include_points' => ['nullable', 'boolean'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:5000'],
        ];
    }
}
