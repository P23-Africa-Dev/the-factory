<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Symfony\Component\Intl\Countries;

class CountryController extends Controller
{
    public function index(): JsonResponse
    {
        $countries = collect(Countries::getNames('en'))
            ->map(fn (string $name, string $code): array => [
                'label' => $name,
                'value' => strtoupper($code),
            ])
            ->sortBy('label', SORT_NATURAL | SORT_FLAG_CASE)
            ->values()
            ->all();

        return $this->success('Supported countries fetched successfully.', [
            'countries' => $countries,
        ]);
    }
}
