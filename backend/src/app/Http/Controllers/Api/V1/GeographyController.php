<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\GeographyCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GeographyController extends Controller
{
    public function states(Request $request): JsonResponse
    {
        $countryCode = strtoupper(trim((string) $request->query('country_code', '')));

        if ($countryCode === '' || strlen($countryCode) !== 2) {
            return $this->error('A valid country_code query parameter is required.', 422);
        }

        return $this->success('States fetched successfully.', [
            'country_code' => $countryCode,
            'supported' => GeographyCatalog::isSupported($countryCode),
            'states' => GeographyCatalog::states($countryCode),
        ]);
    }

    public function lgas(Request $request): JsonResponse
    {
        $countryCode = strtoupper(trim((string) $request->query('country_code', '')));
        $stateName = trim((string) $request->query('state_name', ''));

        if ($countryCode === '' || strlen($countryCode) !== 2) {
            return $this->error('A valid country_code query parameter is required.', 422);
        }

        if ($stateName === '') {
            return $this->error('A state_name query parameter is required.', 422);
        }

        return $this->success('Local areas fetched successfully.', [
            'country_code' => $countryCode,
            'state_name' => $stateName,
            'supported' => GeographyCatalog::isSupported($countryCode),
            'lgas' => GeographyCatalog::lgas($countryCode, $stateName),
        ]);
    }
}
