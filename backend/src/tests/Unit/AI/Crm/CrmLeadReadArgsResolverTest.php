<?php

declare(strict_types=1);

namespace Tests\Unit\AI\Crm;

use App\Services\AI\Crm\CrmLeadReadArgsResolver;
use Tests\TestCase;

final class CrmLeadReadArgsResolverTest extends TestCase
{
    private CrmLeadReadArgsResolver $resolver;

    protected function setUp(): void
    {
        parent::setUp();
        $this->resolver = $this->app->make(CrmLeadReadArgsResolver::class);
    }

    public function test_resolve_filters_extracts_lagos_search_from_location_question(): void
    {
        $args = $this->resolver->resolveFilters('Do I have any leads in Lagos?');

        $this->assertSame('Lagos', $args['search'] ?? null);
    }

    public function test_resolve_filters_extracts_search_from_how_many_leads_in_city_prompt(): void
    {
        $args = $this->resolver->resolveFilters('How many leads do I have in Lagos?');

        $this->assertSame('Lagos', $args['search'] ?? null);
    }

    public function test_resolve_filters_does_not_treat_my_crm_as_location_search(): void
    {
        $args = $this->resolver->resolveFilters('provide me the list of leads in my crm');

        $this->assertArrayNotHasKey('search', $args);
    }

    public function test_resolve_filters_extracts_named_leads_from_what_about_prompt(): void
    {
        $args = $this->resolver->resolveFilters(
            'What about Faith University, Tester Sam, Zet Bank, Breath School, and Greet Filling Station?',
        );

        $this->assertSame(
            ['Faith University', 'Tester Sam', 'Zet Bank', 'Breath School', 'Greet Filling Station'],
            $args['named_leads'] ?? [],
        );
    }
}
