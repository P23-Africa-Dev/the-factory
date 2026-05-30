<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Calendar;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Services\Calendar\CompanyCalendarConnectionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class CalendarIntegrationController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(private readonly CompanyCalendarConnectionService $connectionService) {}

    public function status(Request $request): JsonResponse
    {
        $data = $this->connectionService->status(
            user: $request->user(),
            companyId: $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Calendar integration status fetched successfully.',
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
            message: 'Google Calendar authorization URL generated successfully.',
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
            message: 'Google Calendar integration disconnected successfully.',
            data: $data,
        );
    }

    public function callback(Request $request): JsonResponse
    {
        $error = trim((string) $request->query('error', ''));
        if ($error !== '') {
            throw ValidationException::withMessages([
                'integration' => ['Google returned an OAuth error: ' . $error . '. Please retry connection.'],
            ]);
        }

        $validated = $request->validate([
            'code' => ['required', 'string'],
            'state' => ['required', 'string'],
        ]);

        $data = $this->connectionService->completeCallback(
            code: (string) $validated['code'],
            state: (string) $validated['state'],
        );

        return $this->success(
            message: 'Google Calendar integration connected successfully.',
            data: $data,
        );
    }
}
