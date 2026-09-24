<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\SalesEngine;

use App\Http\Controllers\Controller;
use App\Http\Resources\SalesEngineAccessRequestResource;
use App\Services\Company\CompanyContextService;
use App\Services\SalesEngine\SalesEngineAccessRequestService;
use DomainException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SalesEngineAccessRequestController extends Controller
{
    public function __construct(
        private readonly SalesEngineAccessRequestService $accessRequests,
        private readonly CompanyContextService $companyContext,
    ) {}

    public function status(Request $request): JsonResponse
    {
        $result = $this->accessRequests->statusForUser($request->user());

        return $this->success(
            message: 'Sales Engine access status.',
            data: [
                'status' => $result['status'],
                'request' => $result['request']
                    ? new SalesEngineAccessRequestResource($result['request'])
                    : null,
            ],
        );
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $context = $this->companyContext->resolve(
            $user,
            $request->integer('company_id') ?: null,
        );
        $company = $context['company'];

        try {
            $accessRequest = $this->accessRequests->submit($user, [
                'company_id' => $company?->id,
                'company_name' => $company?->name,
            ]);
        } catch (DomainException $e) {
            return $this->error(
                message: $e->getMessage(),
                errors: ['access' => [$e->getMessage()]],
                status: 409,
            );
        }

        return $this->success(
            message: 'Sales Engine access request submitted.',
            data: [
                'status' => $accessRequest->status,
                'request' => new SalesEngineAccessRequestResource($accessRequest),
            ],
            status: 201,
        );
    }
}
