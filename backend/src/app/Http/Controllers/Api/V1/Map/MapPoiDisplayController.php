<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Map;

use App\Http\Controllers\Controller;
use App\Services\Company\CompanyContextService;
use App\Services\Map\MapPoiDisplaySettingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MapPoiDisplayController extends Controller
{
    public function __construct(
        private readonly MapPoiDisplaySettingService $poiDisplay,
        private readonly CompanyContextService $companyContext,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        ['company' => $company] = $this->companyContext->resolve(
            $request->user(),
            $request->integer('company_id') ?: null,
        );

        return $this->success(
            message: 'Map POI display setting fetched successfully.',
            data: [
                'enabled' => $this->poiDisplay->isEnabledForCompany($company),
                'global_enabled' => $this->poiDisplay->globalEnabled(),
            ],
        );
    }
}
