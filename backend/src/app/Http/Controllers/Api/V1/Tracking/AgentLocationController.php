<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Tracking;

use App\Http\Controllers\Controller;
use App\Http\Requests\Tracking\ListAgentLocationsRequest;
use App\Http\Requests\Tracking\ShowAgentLocationRequest;
use App\Models\User;
use App\Services\Tracking\AgentLocationSnapshotService;
use Illuminate\Http\JsonResponse;

class AgentLocationController extends Controller
{
    public function __construct(private readonly AgentLocationSnapshotService $service) {}

    public function index(ListAgentLocationsRequest $request): JsonResponse
    {
        $result = $this->service->listForUser($request->user(), $request->validated());

        return $this->success(
            message: 'Agent location snapshots fetched successfully.',
            data: $result,
        );
    }

    public function show(ShowAgentLocationRequest $request, User $user): JsonResponse
    {
        $result = $this->service->latestForUser($request->user(), $user, $request->validated());

        return $this->success(
            message: 'Agent latest location snapshot fetched successfully.',
            data: $result,
        );
    }
}
