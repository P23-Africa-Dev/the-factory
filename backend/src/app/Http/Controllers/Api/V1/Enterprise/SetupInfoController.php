<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Enterprise;

use App\Http\Controllers\Controller;
use App\Services\Enterprise\DemoRequestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SetupInfoController extends Controller
{
    public function __construct(private readonly DemoRequestService $demoRequestService) {}

    public function __invoke(Request $request): JsonResponse
    {
        $request->validate([
            'request_id' => ['required', 'integer', 'min:1'],
            'token' => ['required', 'string', 'size:64'],
        ]);

        $demoRequest = $this->demoRequestService->resolveValidApprovedRequestForFirstTimeSetup(
            (int) $request->input('request_id'),
            $request->input('token'),
        );

        return $this->success(
            message: 'Setup info retrieved successfully.',
            data: [
                'request_id' => $demoRequest->id,
                'email' => $demoRequest->email,
                'company_id' => $demoRequest->company?->company_id,
                'company_name' => $demoRequest->company_name,
            ],
        );
    }
}
