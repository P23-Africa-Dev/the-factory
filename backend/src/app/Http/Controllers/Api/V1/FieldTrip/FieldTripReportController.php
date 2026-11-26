<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\FieldTrip;

use App\Http\Controllers\Controller;
use App\Models\FieldActivitySession;
use App\Models\FieldStop;
use App\Models\FieldStop as FieldStopModel;
use App\Models\FieldStopAttachment;
use App\Services\FieldActivity\FieldTripReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Trip reports (any member, for their own trips): record each stop, confirm
 * or correct its place, add missed stops, attach photos/documents, submit.
 */
class FieldTripReportController extends Controller
{
    /** Photos and documents a stop accepts (10 MB each). */
    private const FILE_RULE = 'mimes:jpg,jpeg,png,webp,heic,heif,pdf,doc,docx,xls,xlsx';

    public function __construct(private readonly FieldTripReportService $reports) {}

    public function show(Request $request, FieldActivitySession $trip): JsonResponse
    {
        return $this->success(
            message: 'Trip report loaded.',
            data: $this->reports->report($request->user(), $trip, $request->input('company_id')),
        );
    }

    public function due(Request $request): JsonResponse
    {
        return $this->success(
            message: 'Due trip reports loaded.',
            data: $this->reports->dueReports($request->user(), $request->input('company_id')),
        );
    }

    public function record(Request $request, FieldStop $stop): JsonResponse
    {
        $data = $request->validate($this->recordRules());

        return $this->success(
            message: 'Stop saved.',
            data: ['stop' => $this->reports->recordStop($request->user(), $stop, $data)],
        );
    }

    public function addStop(Request $request, FieldActivitySession $trip): JsonResponse
    {
        $data = $request->validate($this->recordRules(activityRequired: false) + [
            'client_stop_id' => ['nullable', 'string', 'max:64'],
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'address' => ['nullable', 'string', 'max:255'],
            'arrived_at' => ['required', 'date'],
            'departed_at' => ['required', 'date'],
        ]);

        return $this->success(
            message: 'Stop added.',
            data: ['stop' => $this->reports->addManualStop($request->user(), $trip, $data)],
            status: 201,
        );
    }

    public function deleteStop(Request $request, FieldStop $stop): JsonResponse
    {
        return $this->success(
            message: 'Stop removed.',
            data: $this->reports->deleteManualStop($request->user(), $stop, $request->input('company_id')),
        );
    }

    public function addAttachment(Request $request, FieldStop $stop): JsonResponse
    {
        $data = $request->validate([
            'company_id' => ['nullable', 'integer'],
            'file' => ['required', 'file', self::FILE_RULE, 'max:10240'],
            'client_attachment_id' => ['nullable', 'string', 'max:64'],
            'caption' => ['nullable', 'string', 'max:500'],
            'captured_at' => ['nullable', 'date'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
        ]);

        return $this->success(
            message: 'Attachment uploaded.',
            data: ['attachment' => $this->reports->addAttachment($request->user(), $stop, $request->file('file'), $data)],
            status: 201,
        );
    }

    public function showAttachment(Request $request, FieldStopAttachment $attachment): StreamedResponse
    {
        return $this->reports->streamAttachment($request->user(), $attachment, $request->input('company_id'));
    }

    public function deleteAttachment(Request $request, FieldStopAttachment $attachment): JsonResponse
    {
        return $this->success(
            message: 'Attachment removed.',
            data: $this->reports->deleteAttachment($request->user(), $attachment, $request->input('company_id')),
        );
    }

    public function submit(Request $request, FieldActivitySession $trip): JsonResponse
    {
        return $this->success(
            message: 'Trip report submitted.',
            data: $this->reports->submit($request->user(), $trip, $request->input('company_id')),
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function recordRules(bool $activityRequired = true): array
    {
        return [
            'company_id' => ['nullable', 'integer'],
            'activity' => [$activityRequired ? 'required' : 'nullable', 'string', 'in:customer_visit,lead_visit,org_visit,personal,ignore'],
            'lead_id' => ['nullable', 'integer'],
            'company_location_id' => ['nullable', 'integer'],
            'outcome' => ['nullable', 'string', 'in:'.implode(',', FieldStop::OUTCOMES)],
            'notes' => ['nullable', 'string', 'max:5000'],
            'follow_up_at' => ['nullable', 'date'],
            'via' => ['nullable', 'string', 'in:live,review,web'],
            'location' => ['nullable', 'array'],
            'location.action' => ['nullable', 'string', 'in:confirm,correct'],
            'location.latitude' => ['required_if:location.action,correct', 'nullable', 'numeric', 'between:-90,90'],
            'location.longitude' => ['required_if:location.action,correct', 'nullable', 'numeric', 'between:-180,180'],
            'location.address' => ['nullable', 'string', 'max:255'],
        ];
    }
}
