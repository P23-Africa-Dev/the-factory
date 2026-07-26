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
        $this->assertTrue($scorer->isAdequateForProvider($results, 'autocomplete', 'geoapify', 'Lekki Phase 1'));
    }

    public function test_wrong_named_geoapify_business_result_is_not_adequate(): void
    {
        $scorer = new PlaceQualityScorer();

        // Geoapify returns high-confidence same-category places in the wrong
        // country for a brand query. Score is high, but none is named "Jara" —
        // the waterfall must fall through to Foursquare/Google.
        $results = [
            new PlaceSuggestion(
                id: '1',
                name: 'Jaraguá Mall',
                formattedAddress: 'Jaraguá Mall, Avenida Madre Maria Teodora, Piracicaba - SP, Brazil',
                provider: 'geoapify',
                latitude: -22.7,
                longitude: -47.6,
                confidence: 1.0,
            ),
            new PlaceSuggestion(
                id: '2',
                name: 'Alba Mall',
                formattedAddress: 'Alba Industrial Zone, Székesfehérvár, Hungary',
                provider: 'geoapify',
                latitude: 47.18,
                longitude: 18.42,
                confidence: 1.0,
            ),
        ];

        $this->assertFalse($scorer->isAdequateForProvider($results, 'autocomplete', 'geoapify', 'Jara Mall'));
    }

    public function test_correctly_named_brand_result_is_adequate(): void
    {
        $scorer = new PlaceQualityScorer();

        // Geoapify genuinely indexes these branches by name — no need to fall through.
        $results = [
            new PlaceSuggestion(
                id: '1',
                name: 'Shoprite',
                formattedAddress: 'Shoprite, Obafemi Awolowo Way, Ikeja, Lagos, Nigeria',
                provider: 'geoapify',
                latitude: 6.6,
                longitude: 3.35,
                confidence: 1.0,
            ),
            new PlaceSuggestion(
                id: '2',
                name: 'Shoprite',
                formattedAddress: 'Shoprite, Adeniran Ogunsanya Street, Lagos, Nigeria',
                provider: 'geoapify',
                latitude: 6.49,
                longitude: 3.35,
                confidence: 1.0,
            ),
        ];

        $this->assertTrue($scorer->isAdequateForProvider($results, 'autocomplete', 'geoapify', 'Shoprite'));
    }

    public function test_name_relevance_folds_accents_and_ignores_descriptors(): void
    {
        $scorer = new PlaceQualityScorer();

        $this->assertSame(['jara'], $scorer->significantQueryTokens('Jara Shopping Mall'));

        $jaragua = [new PlaceSuggestion('1', 'Jaraguá Mall', 'Brazil', 'geoapify')];
        $this->assertSame(0.0, $scorer->bestNameRelevance($jaragua, ['jara']));

        $real = [new PlaceSuggestion('2', 'Jara Mall', 'Ikeja, Lagos', 'foursquare')];
        $this->assertSame(1.0, $scorer->bestNameRelevance($real, ['jara']));
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
