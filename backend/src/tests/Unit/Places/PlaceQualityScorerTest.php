<?php

declare(strict_types=1);

namespace Tests\Unit\Places;

use App\DTO\Places\PlaceResult;
use App\DTO\Places\PlaceSuggestion;
use App\Services\Places\PlaceQualityScorer;
use Tests\TestCase;

class PlaceQualityScorerTest extends TestCase
{
    public function test_empty_results_score_zero(): void
    {
        $scorer = new PlaceQualityScorer();
        $this->assertSame(0.0, $scorer->score([], 'autocomplete', 'lekki'));
        $this->assertFalse($scorer->passes(0.0, 'autocomplete'));
    }

    public function test_rich_suggestion_passes_threshold(): void
    {
        $scorer = new PlaceQualityScorer();
        $results = [
            new PlaceSuggestion(
                id: '1',
                name: 'Lekki Phase 1',
                formattedAddress: 'Lekki Phase 1, Lagos, Nigeria',
                provider: 'geoapify',
                latitude: 6.45,
                longitude: 3.47,
                confidence: 0.9,
                categories: ['place'],
            ),
            new PlaceSuggestion(
                id: '2',
                name: 'Lekki Phase 1 Gate',
                formattedAddress: 'Lekki, Lagos, Nigeria',
                provider: 'geoapify',
                latitude: 6.451,
                longitude: 3.471,
                confidence: 0.85,
            ),
        ];

        $score = $scorer->score($results, 'autocomplete', 'Lekki Phase 1', 6.45, 3.47);
        $this->assertGreaterThanOrEqual(0.8, $score);
        $this->assertTrue($scorer->passes($score, 'autocomplete', '12 Admiralty Way Lekki'));
        $this->assertTrue($scorer->isAdequateForProvider($results, 'autocomplete', 'geoapify', 'Shoprite'));
    }

    public function test_thin_geoapify_business_result_is_not_adequate(): void
    {
        $scorer = new PlaceQualityScorer();
        $one = [
            new PlaceSuggestion(
                id: '1',
                name: 'Shoprite',
                formattedAddress: 'Lagos',
                provider: 'geoapify',
                latitude: 6.45,
                longitude: 3.47,
                confidence: 0.9,
            ),
        ];

        $this->assertFalse($scorer->isAdequateForProvider($one, 'autocomplete', 'geoapify', 'Shoprite'));
    }

    public function test_nearby_requires_min_count(): void
    {
        $scorer = new PlaceQualityScorer();
        $one = [
            new PlaceResult(
                id: '1',
                name: 'Cafe',
                formattedAddress: 'Lagos',
                latitude: 6.45,
                longitude: 3.47,
                provider: 'geoapify',
                confidence: 0.9,
            ),
        ];

        $score = $scorer->score($one, 'nearby');
        $this->assertLessThan(0.8, $score);
    }
}
