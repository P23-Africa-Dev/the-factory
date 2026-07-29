<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

trait NormalizesLeadContacts
{
    /**
     * @return array<string, mixed>
     */
    protected function normalizeLeadContacts(): array
    {
        $contacts = $this->input('contacts');
        if (! is_array($contacts) || $contacts === []) {
            return [];
        }

        $normalized = array_values(array_map(
            static fn (mixed $contact): mixed => is_array($contact)
                ? [
                    'name' => self::trimmedValue($contact['name'] ?? null),
                    'email' => self::nullableTrimmedString($contact['email'] ?? null),
                    'phone' => self::nullableTrimmedString($contact['phone'] ?? null),
                    'location' => self::nullableTrimmedString($contact['location'] ?? null),
                ]
                : $contact,
            $contacts,
        ));

        $primary = is_array($normalized[0] ?? null) ? $normalized[0] : [];

        return [
            'contacts' => $normalized,
            'name' => $primary['name'] ?? $this->input('name'),
            'email' => array_key_exists('email', $primary) ? $primary['email'] : $this->input('email'),
            'phone' => array_key_exists('phone', $primary) ? $primary['phone'] : $this->input('phone'),
            'location' => array_key_exists('location', $primary) ? $primary['location'] : $this->input('location'),
        ];
    }

    private static function trimmedValue(mixed $value): mixed
    {
        return is_string($value) ? trim($value) : $value;
    }

    private static function nullableTrimmedString(mixed $value): mixed
    {
        $trimmed = self::trimmedValue($value);

        return $trimmed === '' ? null : $trimmed;
    }
}
