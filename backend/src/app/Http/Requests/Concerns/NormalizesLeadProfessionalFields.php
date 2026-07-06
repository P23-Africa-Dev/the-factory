<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Support\LeadFieldNormalizer;

trait NormalizesLeadProfessionalFields
{
    /**
     * @return array<string, mixed>
     */
    protected function normalizeLeadProfessionalFields(): array
    {
        $merged = [];

        if ($this->has('company_name')) {
            $name = trim((string) $this->input('company_name'));
            $merged['company_name'] = $name !== '' ? $name : null;
        }

        if ($this->has('website')) {
            $merged['website'] = LeadFieldNormalizer::normalizeWebsite(
                $this->input('website') !== null ? (string) $this->input('website') : null
            );
        }

        if ($this->has('position')) {
            $position = trim((string) $this->input('position'));
            $merged['position'] = $position !== '' ? $position : null;
        }

        if ($this->has('profile_urls')) {
            $urls = LeadFieldNormalizer::normalizeProfileUrls($this->input('profile_urls'));
            $merged['profile_urls'] = $urls !== [] ? $urls : null;
        }

        return $merged;
    }
}
