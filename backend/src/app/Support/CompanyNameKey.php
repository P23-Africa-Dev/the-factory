<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Str;

/**
 * Comparison key for "is this the same company?".
 *
 * Case, accents, punctuation and spacing are ignored, "&" reads as "and", and
 * common legal endings are dropped, so "P23 Africa", "p23  africa" and
 * "P23-Africa Ltd." share a key, while "P23" and "P23 Africa" do not.
 */
final class CompanyNameKey
{
    /** Trailing words removed repeatedly ("Acme Holdings Ltd" keeps "holdings"). */
    private const LEGAL_SUFFIXES = [
        'ltd', 'limited', 'llc', 'llp', 'lp', 'inc', 'incorporated', 'plc', 'corp', 'corporation',
        'co', 'company', 'gmbh', 'ag', 'sa', 'sas', 'sarl', 'bv', 'nv', 'pty', 'pte', 'srl', 'spa', 'oy', 'ab',
    ];

    public static function key(?string $companyName): ?string
    {
        if ($companyName === null) {
            return null;
        }

        $value = Str::of(Str::ascii($companyName))
            ->lower()
            ->replace('&', ' and ')
            ->replaceMatches('/[^a-z0-9]+/', ' ')
            ->squish()
            ->value();

        if ($value === '') {
            return null;
        }

        $words = explode(' ', $value);

        while (count($words) > 1 && in_array(end($words), self::LEGAL_SUFFIXES, true)) {
            array_pop($words);
        }

        $key = implode(' ', $words);

        return $key !== '' ? $key : null;
    }

    /** First word of the key, used to narrow SQL candidates before exact comparison. */
    public static function firstWord(string $key): string
    {
        return explode(' ', $key)[0];
    }
}
