<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Tracking;

use App\Http\Controllers\Controller;
use App\Services\Tracking\TrackingSocketAuthorizationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Called by the realtime relay (with the viewer's own bearer token) to learn
 * which tracking events a WebSocket connection is allowed to receive.
 */
class TrackingSocketAuthorizationController extends Controller
{
    public function __construct(private readonly TrackingSocketAuthorizationService $service) {}

    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable', 'string', 'max:64'],
            'task_ids' => ['nullable', 'string', 'max:2000'],
        ]);

        $taskIds = array_map(
            'intval',
            array_filter(explode(',', (string) ($validated['task_ids'] ?? '')), static fn(string $v): bool => ctype_digit(trim($v))),
        );

        return $this->success(
            message: 'Tracking socket authorization resolved.',
            data: $this->service->authorize(
                $request->user(),
                isset($validated['company_id']) ? (string) $validated['company_id'] : null,
                $taskIds,
            ),
        );
    }
}
