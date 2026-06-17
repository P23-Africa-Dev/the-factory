<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\AI;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Services\AI\Innovation\PhaseFiveCopilotService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CopilotInnovationController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(private readonly PhaseFiveCopilotService $phaseFiveCopilotService) {}

    public function transcribeVoice(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable'],
            'audio' => ['required', 'file', 'mimes:mp3,wav,m4a,ogg,webm', 'max:20480'],
        ]);

        $result = $this->phaseFiveCopilotService->transcribeVoice(
            user: $request->user(),
            audio: $request->file('audio'),
            companyId: $this->resolveCompanyContextId($validated['company_id'] ?? null),
        );

        return $this->success(
            message: 'Voice transcription processed successfully.',
            data: $result,
        );
    }

    public function analyzeFile(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable'],
            // Accept a wider set of document and spreadsheet types to avoid client-side rejections
            'file' => ['required', 'file', 'mimes:pdf,doc,docx,txt,xlsx,xls,csv', 'max:30720'],
        ]);

        $result = $this->phaseFiveCopilotService->analyzeFile(
            user: $request->user(),
            file: $request->file('file'),
            companyId: $this->resolveCompanyContextId($validated['company_id'] ?? null),
        );

        return $this->success(
            message: 'File analysis processed successfully.',
            data: $result,
        );
    }

    public function summarizeTranscript(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable'],
            'meeting_id' => ['nullable', 'integer', 'exists:meetings,id'],
            'transcript' => ['required', 'string', 'min:20', 'max:50000'],
        ]);

        $result = $this->phaseFiveCopilotService->summarizeMeetingTranscript(
            user: $request->user(),
            transcript: (string) $validated['transcript'],
            meetingId: isset($validated['meeting_id']) ? (int) $validated['meeting_id'] : null,
            companyId: $this->resolveCompanyContextId($validated['company_id'] ?? null),
        );

        return $this->success(
            message: 'Meeting transcript summary generated successfully.',
            data: $result,
        );
    }

    public function forecastOverview(Request $request): JsonResponse
    {
        $result = $this->phaseFiveCopilotService->forecastOverview(
            user: $request->user(),
            companyId: $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Forecast overview generated successfully.',
            data: $result,
        );
    }
}
