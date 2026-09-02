<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ExchangeSupportAccessRequest;
use App\Models\SupportAccessSession;
use App\Services\Admin\SupportAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SupportAccessController extends Controller
{
    public function __construct(private readonly SupportAccessService $service) {}

    public function exchange(ExchangeSupportAccessRequest $request): JsonResponse
    {
        $result = $this->service->exchange(
            code: (string) $request->validated('code'),
            request: $request,
        );

        return $this->success(
            message: 'Support session started.',
            data: [
                'token' => $result['token'],
                'support_session' => $this->service->payload($result['session']),
            ],
        );
    }

    public function status(Request $request): JsonResponse
    {
        $session = $request->attributes->get('support_access_session');

        if (! $session instanceof SupportAccessSession) {
            return $this->error(
                message: 'No active support session was found.',
                errors: null,
                status: 401,
            );
        }

        return $this->success(
            message: 'Support session retrieved.',
            data: ['support_session' => $this->service->payload($session)],
        );
    }

    public function end(Request $request): JsonResponse
    {
        $session = $request->attributes->get('support_access_session');

        if (! $session instanceof SupportAccessSession) {
            return $this->error(
                message: 'No active support session was found.',
                errors: null,
                status: 401,
            );
        }

        $this->service->end($session, $request);

        return $this->success(
            message: 'Support session ended.',
            data: null,
        );
    }
}
