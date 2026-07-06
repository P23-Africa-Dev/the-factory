<?php

declare(strict_types=1);

namespace Tests\Unit\Support;

use App\Support\LeadFieldNormalizer;
use Tests\TestCase;

class LeadFieldNormalizerTest extends TestCase
{
    public function test_normalize_profile_urls_from_comma_separated_string(): void
    {
        $urls = LeadFieldNormalizer::normalizeProfileUrls('https://a.test, https://b.test');

        $this->assertSame(['https://a.test', 'https://b.test'], $urls);
    }

    public function test_normalize_website_adds_https_scheme(): void
    {
        $this->assertSame('https://acme.com', LeadFieldNormalizer::normalizeWebsite('acme.com'));
    }

    public function test_invalid_profile_urls_are_detected(): void
    {
        $invalid = LeadFieldNormalizer::invalidProfileUrls(['https://valid.test', 'bad-url']);

        $this->assertSame(['bad-url'], $invalid);
    }
}
