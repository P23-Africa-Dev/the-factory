<?php

namespace App\Http\Controllers\Api\V1\Enterprise;

use App\Http\Controllers\Controller;
use App\Http\Requests\Enterprise\BookDemoRequest;
use App\Http\Resources\CompanyDemoRequestResource;
use App\Services\Enterprise\DemoRequestService;
use DomainException;
use Illuminate\Http\JsonResponse;

class BookDemoController extends Controller
{
    public function __construct(private readonly DemoRequestService $demoRequestService) {}

    public function __invoke(BookDemoRequest $request): JsonResponse
    {
        try {
            $demoRequest = $this->demoRequestService->submit($request->validated());
        } catch (DomainException $e) {
            return $this->error(
                message: $e->getMessage(),
                errors: ['email' => [$e->getMessage()]],
                status: 409,
            );
        }

        return $this->success(
            message: 'Demo request submitted successfully. We have sent a confirmation email.',
            data: [
                'request' => new CompanyDemoRequestResource($demoRequest),
            ],
            status: 201,
        );
    }
}
