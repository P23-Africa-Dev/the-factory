<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Support\LeadFieldNormalizer;

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
            static function (mixed $contact): mixed {
                if (! is_array($contact)) {
                    return $contact;
                }

                $rawUrls = $contact['profile_urls'] ?? ($contact['profile_url'] ?? null);
                $profileUrls = null;
                if (is_array($rawUrls)) {
                    $cleaned = LeadFieldNormalizer::normalizeProfileUrls($rawUrls);
                    $profileUrls = $cleaned !== [] ? $cleaned : null;
                } elseif (is_string($rawUrls) && trim($rawUrls) !== '') {
                    $cleaned = LeadFieldNormalizer::normalizeProfileUrls([$rawUrls]);
                    $profileUrls = $cleaned !== [] ? $cleaned : null;
                }

                return [
                    'name' => self::trimmedValue($contact['name'] ?? null),
                    'email' => self::nullableTrimmedString($contact['email'] ?? null),
                    'phone' => self::nullableTrimmedString($contact['phone'] ?? null),
                    'location' => self::nullableTrimmedString($contact['location'] ?? null),
                    'position' => self::nullableTrimmedString($contact['position'] ?? null),
                    'profile_urls' => $profileUrls,
                ];
            },
            $contacts,
        ));

        $primary = is_array($normalized[0] ?? null) ? $normalized[0] : [];
        $explicitName = $this->filled('name') ? self::trimmedValue($this->input('name')) : null;

        return [
            'contacts' => $normalized,
            'name' => $explicitName ?? ($primary['name'] ?? $this->input('name')),
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
