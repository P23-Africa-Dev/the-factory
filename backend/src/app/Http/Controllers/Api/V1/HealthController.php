<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => 'API is healthy (Monorepo version)',
            'data' => [
                'service' => config('app.name'),
                'environment' => app()->environment(),
                'timestamp' => now()->toIso8601String(),
            ],
            'errors' => null,
        ]);
    }
}