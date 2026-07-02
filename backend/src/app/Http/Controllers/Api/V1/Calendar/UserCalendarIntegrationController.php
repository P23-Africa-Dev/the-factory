<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Calendar;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Services\Calendar\UserCalendarConnectionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserCalendarIntegrationController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(private readonly UserCalendarConnectionService $connectionService) {}

    public function status(Request $request): JsonResponse
    {
        $data = $this->connectionService->status(
            user: $request->user(),
            companyId: $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'User calendar integration status fetched successfully.',
            data: $data,
        );
    }

    public function connectUrl(Request $request): JsonResponse
    {
        $data = $this->connectionService->createConnectUrl(
            user: $request->user(),
            companyId: $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Google Calendar authorization URL generated successfully for the current user.',
            data: $data,
        );
    }

    public function disconnect(Request $request): JsonResponse
    {
        $data = $this->connectionService->disconnect(
            user: $request->user(),
            companyId: $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Google Calendar disconnected successfully for the current user.',
            data: $data,
        );
    }

    public function switchUrl(Request $request): JsonResponse
    {
        $data = $this->connectionService->switchAccountConnectUrl(
            user: $request->user(),
            companyId: $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Google Calendar switch-account URL generated successfully for the current user.',
            data: $data,
        );
    }

    public function reconnectUrl(Request $request): JsonResponse
    {
        $data = $this->connectionService->reconnectUrl(
            user: $request->user(),
            companyId: $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Google Calendar reconnect URL generated successfully for the current user.',
            data: $data,
        );
    }
}
