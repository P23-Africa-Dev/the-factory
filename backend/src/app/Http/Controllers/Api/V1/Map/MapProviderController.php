<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Map;

use App\Http\Controllers\Controller;
use App\Services\Map\MapProviderSettingService;
use Illuminate\Http\JsonResponse;

class MapProviderController extends Controller
{
    public function __construct(private readonly MapProviderSettingService $mapProviderSettingService) {}

    public function __invoke(): JsonResponse
    {
        return $this->success(
            message: 'Map provider fetched successfully.',
            data: [
                'provider' => $this->mapProviderSettingService->getProvider(),
                'meta' => $this->mapProviderSettingService->getSnapshot(),
            ],
        );
    }
}
