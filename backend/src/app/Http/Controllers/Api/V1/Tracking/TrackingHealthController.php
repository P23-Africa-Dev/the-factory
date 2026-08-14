<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Tracking;

use App\Http\Controllers\Controller;
use App\Services\Tracking\TrackingHealthService;
use Illuminate\Http\JsonResponse;

class TrackingHealthController extends Controller
{
    public function __construct(private readonly TrackingHealthService $healthService) {}

    public function __invoke(): JsonResponse
    {
        $metrics = $this->healthService->metrics();

        return $this->success(
            message: 'Tracking health metrics fetched successfully.',
            data: $metrics,
        );
    }
}
