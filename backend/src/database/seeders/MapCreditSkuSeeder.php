<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\MapCreditSku;
use Illuminate\Database\Seeder;

class MapCreditSkuSeeder extends Seeder
{
    /**
     * Credit costs are derived from Google Places (New) list prices at
     * 100 credits = $1. See GOOGLE_MAPS_API_COST_ANALYSIS.md.
     */
    public function run(): void
    {
        $skus = [
            [
                'sku' => 'nearby',
                'label' => 'Nearby Search (Pro) [legacy]',
                'usd_per_1k' => 32.0,
                'credit_cost' => 3.2,
                'sort_order' => 10,
            ],
            [
                'sku' => 'poi-details',
                'label' => 'POI Details / pin enrichment (Enterprise) [legacy]',
                'usd_per_1k' => 20.0,
                'credit_cost' => 2.0,
                'sort_order' => 20,
            ],
            [
                'sku' => 'details',
                'label' => 'Place Details (Essentials) [legacy]',
                'usd_per_1k' => 5.0,
                'credit_cost' => 0.5,
                'sort_order' => 30,
            ],
            [
                'sku' => 'autocomplete',
                'label' => 'Autocomplete request [legacy]',
                'usd_per_1k' => 2.83,
                'credit_cost' => 0.283,
                'sort_order' => 40,
            ],
            [
                'sku' => 'places.autocomplete',
                'label' => 'Places autocomplete (orchestrated)',
                'usd_per_1k' => 2.0,
                'credit_cost' => 0.2,
                'sort_order' => 50,
            ],
            [
                'sku' => 'places.search',
                'label' => 'Places text search (orchestrated)',
                'usd_per_1k' => 4.0,
                'credit_cost' => 0.4,
                'sort_order' => 60,
            ],
            [
                'sku' => 'places.nearby',
                'label' => 'Places nearby (orchestrated)',
                'usd_per_1k' => 10.0,
                'credit_cost' => 1.0,
                'sort_order' => 70,
            ],
            [
                'sku' => 'places.details',
                'label' => 'Places details (orchestrated)',
                'usd_per_1k' => 4.0,
                'credit_cost' => 0.4,
                'sort_order' => 80,
            ],
            [
                'sku' => 'places.geocode',
                'label' => 'Places geocode (orchestrated)',
                'usd_per_1k' => 2.0,
                'credit_cost' => 0.2,
                'sort_order' => 90,
            ],
            [
                'sku' => 'places.reverse',
                'label' => 'Places reverse geocode (orchestrated)',
                'usd_per_1k' => 2.0,
                'credit_cost' => 0.2,
                'sort_order' => 100,
            ],
        ];

        foreach ($skus as $sku) {
            MapCreditSku::query()->updateOrCreate(
                ['sku' => $sku['sku']],
                [
                    'label' => $sku['label'],
                    'usd_per_1k' => $sku['usd_per_1k'],
                    'credit_cost' => $sku['credit_cost'],
                    'is_active' => true,
                    'sort_order' => $sku['sort_order'],
                ]
            );
        }
    }
}
