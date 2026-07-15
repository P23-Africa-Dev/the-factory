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
                'label' => 'Nearby Search (Pro)',
                'usd_per_1k' => 32.0,
                'credit_cost' => 3.2,
                'sort_order' => 10,
            ],
            [
                'sku' => 'poi-details',
                'label' => 'POI Details / pin enrichment (Enterprise)',
                'usd_per_1k' => 20.0,
                'credit_cost' => 2.0,
                'sort_order' => 20,
            ],
            [
                'sku' => 'details',
                'label' => 'Place Details (Essentials)',
                'usd_per_1k' => 5.0,
                'credit_cost' => 0.5,
                'sort_order' => 30,
            ],
            [
                'sku' => 'autocomplete',
                'label' => 'Autocomplete request',
                'usd_per_1k' => 2.83,
                'credit_cost' => 0.283,
                'sort_order' => 40,
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
