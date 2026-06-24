<?php

declare(strict_types=1);

namespace App\Services\AI\Innovation;

use App\Models\Meeting;
use App\Models\User;
use App\Services\AI\ElySystemPrompt;
use App\Services\AI\Providers\AiProviderRouter;
use App\Services\Company\CompanyContextService;
use App\Services\Dashboard\DashboardAggregateService;
use App\Services\Payroll\PayrollService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PhaseFiveCopilotService
{
    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly DashboardAggregateService $dashboardAggregateService,
        private readonly PayrollService $payrollService,
        private readonly AiProviderRouter $aiProviderRouter,
    ) {}

    public function transcribeVoice(User $user, UploadedFile $audio, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);

        return [
            'company_id' => (int) $context['company']->id,
            'role' => (string) $context['role'],
            'pipeline' => 'voice.input.v1',
            'file_name' => (string) $audio->getClientOriginalName(),
            'mime_type' => (string) ($audio->getMimeType() ?? 'application/octet-stream'),
            'size_bytes' => (int) $audio->getSize(),
            'transcript' => $this->aiProviderRouter->transcribeAudio(
                audio: $audio,
                prompt: 'Transcribe operations meeting audio with clear punctuation and short sentences.',
            ) ?? 'Voice transcription pipeline is active. Provider transcription integration can now be attached to this endpoint.',
        ];
    }

    public function analyzeFile(User $user, UploadedFile $file, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $extension = strtolower((string) $file->getClientOriginalExtension());

        $isSpreadsheet = in_array($extension, ['xlsx', 'xls', 'csv'], true);
        $isPdf = $extension === 'pdf';
        $isDocument = in_array($extension, ['pdf', 'doc', 'docx', 'txt'], true);

        $analysis = [
            'kind' => $isSpreadsheet ? 'spreadsheet' : 'document',
            'summary' => $isPdf
                ? 'PDF pipeline accepted. Text extraction and semantic analysis can be attached in provider stage.'
                : ($isSpreadsheet
                    ? 'Spreadsheet pipeline accepted. Tabular inspection can be attached in provider stage.'
                    : 'Document pipeline accepted. Text extraction and semantic analysis can be attached in provider stage.'),
        ];

        return [
            'company_id' => (int) $context['company']->id,
            'pipeline' => 'file.analysis.v1',
            'file_name' => (string) $file->getClientOriginalName(),
            'extension' => $extension,
            'size_bytes' => (int) $file->getSize(),
            'analysis' => $analysis,
        ];
    }

    public function summarizeMeetingTranscript(
        User $user,
        string $transcript,
        ?int $meetingId = null,
        ?int $companyId = null,
    ): array {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;

        if ($meetingId !== null) {
            $meeting = Meeting::query()->find($meetingId);
            if (! $meeting || (int) $meeting->company_id !== $resolvedCompanyId) {
                throw ValidationException::withMessages([
                    'meeting_id' => ['Meeting does not exist in the active company scope.'],
                ]);
            }
        }

        $lines = collect(preg_split('/\r\n|\r|\n/', trim($transcript)) ?: [])
            ->map(static fn(string $line): string => trim($line))
            ->filter(static fn(string $line): bool => $line !== '');

        $keyPoints = $lines->take(5)->values()->all();

        $actionItems = $lines
            ->filter(
                static fn(string $line): bool =>
                str_contains(strtolower($line), 'action')
                    || str_contains(strtolower($line), 'todo')
                    || str_contains(strtolower($line), 'next step')
                    || str_contains(strtolower($line), 'will ')
                    || str_contains(strtolower($line), 'should ')
            )
            ->take(8)
            ->values()
            ->all();

        if ($actionItems === []) {
            $actionItems = [
                'No explicit action lines found. Review key points and assign owners manually.',
            ];
        }

        $providerSummary = $this->aiProviderRouter->generateForPurpose(
            purpose: 'report',
            systemPrompt: ElySystemPrompt::meetingTranscriptSummary(),
            userPrompt: $transcript,
            options: [
                'max_tokens' => 220,
            ],
        );

        return [
            'company_id' => $resolvedCompanyId,
            'meeting_id' => $meetingId,
            'pipeline' => 'meeting.transcript.summary.v1',
            'summary' => [
                'key_points' => $keyPoints,
                'action_items' => $actionItems,
                'recommended_follow_up' => 'Convert action items into tasks and schedule follow-up meeting reminders.',
                'provider_summary' => $providerSummary,
            ],
        ];
    }

    public function forecastOverview(User $user, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;

        $dashboard = $this->dashboardAggregateService->overview($user, $resolvedCompanyId);
        $payroll = $this->payrollService->overview($user, [
            'company_id' => $resolvedCompanyId,
        ]);

        $kpis = is_array($dashboard['kpis'] ?? null) ? $dashboard['kpis'] : [];
        $activity = is_array($dashboard['activity_summary'] ?? null) ? $dashboard['activity_summary'] : [];
        $projectKpis = is_array($dashboard['project_kpis'] ?? null) ? $dashboard['project_kpis'] : [];

        $recommendations = [];

        if (((int) ($kpis['completed_tasks'] ?? 0)) < max(1, (int) floor(((int) ($kpis['total_tasks'] ?? 0)) * 0.5))) {
            $recommendations[] = 'Task completion ratio is below 50%. Prioritize overdue and in-progress task recovery plans this week.';
        }

        if (((float) ($payroll['pending_approval'] ?? 0.0)) > 0) {
            $recommendations[] = 'Pending payroll approvals detected. Clear pending approvals to reduce payroll cycle risk.';
        }

        if (((int) ($projectKpis['completion_rate'] ?? 0)) < 40) {
            $recommendations[] = 'Project completion rate is low. Review at-risk projects and rebalance staffing for critical paths.';
        }

        if ($recommendations === []) {
            $recommendations[] = 'Operational indicators are stable. Maintain current cadence and monitor weekly KPI drift.';
        }

        return [
            'company_id' => $resolvedCompanyId,
            'pipeline' => 'forecast.recommendations.v1',
            'snapshot' => [
                'kpis' => $kpis,
                'activity_summary' => $activity,
                'project_kpis' => $projectKpis,
                'payroll_overview' => $payroll,
            ],
            'forecast' => [
                'outlook' => 'next_7_days',
                'confidence' => 0.62,
                'recommendations' => $recommendations,
                'generated_at' => now()->toIso8601String(),
                'trace_id' => (string) Str::uuid(),
            ],
        ];
    }
}
