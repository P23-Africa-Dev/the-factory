<?php

declare(strict_types=1);

namespace Tests\Unit\AI;

use App\Services\AI\Support\ReadListPresenter;
use Tests\TestCase;

final class ReadListPresenterTest extends TestCase
{
    private ReadListPresenter $presenter;

    protected function setUp(): void
    {
        parent::setUp();
        $this->presenter = $this->app->make(ReadListPresenter::class);
    }

    public function test_enrich_payload_sets_truncation_metadata_for_large_totals(): void
    {
        $items = array_fill(0, 10, ['id' => 1, 'title' => 'Task']);

        $payload = $this->presenter->enrichPayload($items, 75);

        $this->assertSame(10, $payload['count']);
        $this->assertSame(75, $payload['total']);
        $this->assertTrue($payload['truncated']);
        $this->assertSame(65, $payload['remaining_count']);
        $this->assertTrue($payload['offer_full_list']);
        $this->assertSame(10, $payload['preview_limit']);
    }

    public function test_enrich_payload_includes_matched_and_organization_totals_when_filtering(): void
    {
        $items = array_fill(0, 7, ['id' => 1, 'name' => 'Lead']);

        $payload = $this->presenter->enrichPayload(
            items: $items,
            total: 7,
            matchedTotal: 7,
            organizationTotal: 14,
        );

        $this->assertSame(7, $payload['matched_total']);
        $this->assertSame(14, $payload['total']);
        $this->assertFalse($payload['truncated']);
        $this->assertSame(0, $payload['remaining_count']);
    }

    public function test_format_list_header_mentions_filter_and_organization_total(): void
    {
        $header = $this->presenter->formatListHeader(
            resourceLabel: 'lead(s)',
            shownCount: 7,
            scopeTotal: 7,
            filterLabel: 'Lagos',
            truncated: false,
            remainingCount: 0,
            organizationTotal: 14,
        );

        $this->assertStringContainsString('7 lead(s) matching "Lagos"', $header);
        $this->assertStringContainsString('14 total in your CRM', $header);
    }

    public function test_format_list_header_mentions_remaining_items_when_truncated(): void
    {
        $header = $this->presenter->formatListHeader(
            resourceLabel: 'overdue task(s)',
            shownCount: 10,
            scopeTotal: 75,
            filterLabel: null,
            truncated: true,
            remainingCount: 65,
        );

        $this->assertStringContainsString('Found 75 overdue task(s)', $header);
        $this->assertStringContainsString('Showing 10 (65 more)', $header);
    }
}
