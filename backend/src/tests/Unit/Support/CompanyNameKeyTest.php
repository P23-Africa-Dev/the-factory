<?php

declare(strict_types=1);

namespace Tests\Unit\Support;

use App\Support\CompanyNameKey;
use Tests\TestCase;

class CompanyNameKeyTest extends TestCase
{
    public function test_case_spacing_punctuation_and_legal_endings_are_ignored(): void
    {
        $expected = 'p23 africa';

        $this->assertSame($expected, CompanyNameKey::key('P23 Africa'));
        $this->assertSame($expected, CompanyNameKey::key('  p23   africa '));
        $this->assertSame($expected, CompanyNameKey::key('P23 Africa Ltd.'));
        $this->assertSame($expected, CompanyNameKey::key('P23-Africa Limited'));
        $this->assertSame($expected, CompanyNameKey::key('P23 Africa, Inc'));
    }

    public function test_different_names_do_not_match(): void
    {
        $this->assertNotSame(CompanyNameKey::key('P23'), CompanyNameKey::key('P23 Africa'));
        $this->assertSame('acme and sons', CompanyNameKey::key('Acme & Sons Ltd'));
        $this->assertSame('acme holdings', CompanyNameKey::key('Acme Holdings Limited'));
    }

    public function test_a_lone_legal_word_is_kept_and_empty_input_gives_null(): void
    {
        $this->assertSame('company', CompanyNameKey::key('Company'));
        $this->assertNull(CompanyNameKey::key(null));
        $this->assertNull(CompanyNameKey::key('   '));
        $this->assertNull(CompanyNameKey::key('---'));
    }
}
