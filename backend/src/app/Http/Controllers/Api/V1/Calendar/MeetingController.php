<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Calendar;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Http\Requests\Calendar\StoreMeetingRequest;
use App\Http\Requests\Calendar\UpdateMeetingRequest;
use App\Http\Resources\MeetingResource;
use App\Models\Meeting;
use App\Services\Calendar\MeetingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MeetingController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(private readonly MeetingService $meetingService) {}

    public function index(Request $request): JsonResponse
    {
        $meetings = $this->meetingService->listForUser($request->user(), [
            'company_id' => $this->resolveCompanyContextId($request->input('company_id')),
            'status' => $request->string('status')->toString(),
            'project_id' => $request->input('project_id'),
            'task_id' => $request->input('task_id'),
            'from' => $request->string('from')->toString(),
            'to' => $request->string('to')->toString(),
            'per_page' => $request->input('per_page'),
        ]);

        return $this->success(
            message: 'Meetings fetched successfully.',
            data: [
                'items' => MeetingResource::collection($meetings->items()),
                'pagination' => [
                    'next_page_url' => $meetings->nextPageUrl(),
                    'prev_page_url' => $meetings->previousPageUrl(),
                    'per_page' => $meetings->perPage(),
                ],
            ],
        );
    }

    public function attendees(Request $request): JsonResponse
    {
        $data = $this->meetingService->listAttendeeCandidates(
            $request->user(),
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Meeting attendee candidates fetched successfully.',
            data: $data,
        );
    }

    public function store(StoreMeetingRequest $request): JsonResponse
    {
        $result = $this->meetingService->create($request->user(), $request->validated());

        return $this->success(
            message: 'Meeting created successfully.',
            data: [
                'meeting' => new MeetingResource($result['meeting']),
                'integration' => $result['integration'],
                'warnings' => $result['warnings'],
            ],
            status: 201,
        );
    }

    public function show(Request $request, Meeting $meeting): JsonResponse
    {
        $meeting = $this->meetingService->findForUser(
            $request->user(),
            $meeting,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Meeting fetched successfully.',
            data: ['meeting' => new MeetingResource($meeting)],
        );
    }

    public function update(UpdateMeetingRequest $request, Meeting $meeting): JsonResponse
    {
        $result = $this->meetingService->update($request->user(), $meeting, $request->validated());

        return $this->success(
            message: 'Meeting updated successfully.',
            data: [
                'meeting' => new MeetingResource($result['meeting']),
                'integration' => $result['integration'],
                'warnings' => $result['warnings'],
            ],
        );
    }

    public function destroy(Request $request, Meeting $meeting): JsonResponse
    {
        $result = $this->meetingService->delete(
            $request->user(),
            $meeting,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Meeting deleted successfully.',
            data: [
                'meeting' => new MeetingResource($result['meeting']),
                'integration' => $result['integration'],
                'warnings' => $result['warnings'],
            ],
        );
    }

    public function cancel(Request $request, Meeting $meeting): JsonResponse
    {
        $result = $this->meetingService->cancel(
            $request->user(),
            $meeting,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Meeting cancelled successfully.',
            data: [
                'meeting' => new MeetingResource($result['meeting']),
                'integration' => $result['integration'],
                'warnings' => $result['warnings'],
            ],
        );
    }

    public function resync(Request $request, Meeting $meeting): JsonResponse
    {
        $result = $this->meetingService->resync(
            $request->user(),
            $meeting,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Meeting sync queued successfully.',
            data: [
                'meeting' => new MeetingResource($result['meeting']),
                'integration' => $result['integration'],
                'warnings' => $result['warnings'],
            ],
        );
    }
}
