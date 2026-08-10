<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

/**
 * Query-string booleans arrive as "true"/"false" from URLSearchParams /
 * String(true). Laravel's `boolean` rule only accepts 0/1/"0"/"1"/true/false,
 * so normalize common truthy/falsey strings before validation.
 */
trait NormalizesQueryBooleans
{
    /**
     * @param  list<string>  $keys
     */
    protected function normalizeBooleanInputs(array $keys): void
    {
        $normalized = [];

        foreach ($keys as $key) {
            if (! $this->exists($key)) {
                continue;
            }

            $value = $this->input($key);
            if (is_bool($value) || is_int($value)) {
                continue;
            }

            $asString = strtolower(trim((string) $value));
            $normalized[$key] = match ($asString) {
                '1', 'true', 'yes', 'on' => true,
                '0', 'false', 'no', 'off', '' => false,
                default => $value,
            };
        }

        if ($normalized !== []) {
            $this->merge($normalized);
        }
    }
}
