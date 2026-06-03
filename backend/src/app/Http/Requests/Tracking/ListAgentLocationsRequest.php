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
        $normalizedIncludeOffline = $this->normalizeIncludeOffline($this->input('include_offline'));

        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            'include_offline' => $normalizedIncludeOffline,
        ]);
    }

    private function normalizeIncludeOffline(mixed $value): mixed
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
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
            'task_id' => ['nullable', 'integer', 'exists:tasks,id'],
            'include_offline' => ['nullable', 'boolean'],
            'stale_after_seconds' => ['nullable', 'integer', 'min:60', 'max:86400'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:500'],
        ];
    }
}
