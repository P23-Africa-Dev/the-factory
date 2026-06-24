<?php

declare(strict_types=1);

namespace App\Services\AI\Innovation;

use App\Models\Meeting;
use App\Models\Task;
use App\Models\User;
use App\Services\AI\ElySystemPrompt;
use App\Services\AI\Kpi\TeamPerformanceService;
use App\Services\AI\Support\AiPlainTextFormatter;
use App\Services\AI\Providers\AiProviderRouter;
use App\Services\Attendance\AttendanceService;
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
        private readonly AttendanceService $attendanceService,
        private readonly TeamPerformanceService $teamPerformanceService,
        private readonly AiProviderRouter $aiProviderRouter,
        private readonly CopilotFileTextExtractor $fileTextExtractor,
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

        $extractedText = $this->fileTextExtractor->extract($file, $extension);
        $aiSummary = null;
        $analysisMethod = 'none';

        $systemPrompt = <<<'PROMPT'
You are ELY, an operations assistant. Analyze the uploaded file and return plain text only.
Do not use markdown. Never use asterisks, hash headings, hyphen bullets, or horizontal rules.
Structure your response with short section labels on their own line, such as:
Summary:
Key findings:
Recommended next actions:
Use the bullet character • for list items. Use numbered items like "1." when ordering steps.
Provide a concise summary, key findings or metrics, and recommended next actions.
Do not invent data that is not present in the file.
PROMPT;

        if (is_string($extractedText) && trim($extractedText) !== '') {
            $analysisMethod = 'local_extract';
            $aiSummary = $this->aiProviderRouter->generateForPurpose(
                purpose: 'operational',
                systemPrompt: $systemPrompt,
                userPrompt: "File name: {$file->getClientOriginalName()}\n\nExcerpt:\n" . Str::limit($extractedText, 12000),
                options: [
                    'max_tokens' => 900,
                    'temperature' => 0.2,
                ],
            );
        } elseif ($isPdf) {
            $analysisMethod = 'openai_pdf';
            $aiSummary = $this->aiProviderRouter->analyzeDocumentFile(
                file: $file,
                systemPrompt: $systemPrompt,
                userPrompt: 'Analyze this PDF document for operational insights. Return plain text only with section labels Summary, Key findings, and Recommended next actions. Use • for bullets. If the document is image-based or scanned, read visible text from the pages and summarize what you can.',
                options: [
                    'max_tokens' => 900,
                    'temperature' => 0.2,
                ],
            );
        }

        $analysis = [
            'kind' => $isSpreadsheet ? 'spreadsheet' : 'document',
            'summary' => is_string($aiSummary) && trim($aiSummary) !== ''
                ? AiPlainTextFormatter::normalize(trim($aiSummary))
                : ($isPdf
                    ? 'PDF received but analysis could not be completed. The file may be encrypted, corrupted, or unreadable. Try exporting as TXT or re-uploading an unlocked copy.'
                    : ($isSpreadsheet
                        ? 'Spreadsheet received but no readable rows were found. Ensure the file contains data rows (not only charts/images) or export as CSV and upload again.'
                        : 'Document received but no readable text could be extracted. Upload TXT, CSV, DOCX, or a text-based PDF.')),
            'extracted_chars' => is_string($extractedText) ? mb_strlen($extractedText) : 0,
            'ai_generated' => is_string($aiSummary) && trim($aiSummary) !== '',
            'analysis_method' => $analysisMethod,
        ];

        if (! $analysis['ai_generated']) {
            logger()->warning('Copilot file analysis produced no AI summary.', [
                'file_name' => $file->getClientOriginalName(),
                'extension' => $extension,
                'extracted_chars' => $analysis['extracted_chars'],
                'analysis_method' => $analysisMethod,
                'company_id' => (int) $context['company']->id,
                'user_id' => (int) $user->id,
            ]);
        }

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

    public function forecastOverview(User $user, ?int $companyId = null, int $horizonDays = 7): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $role = (string) $context['role'];
        $horizonDays = max(7, min(30, $horizonDays));
        $toDate = now()->toDateString();
        $fromDate = now()->subDays($horizonDays - 1)->toDateString();
        $priorFromDate = now()->subDays(($horizonDays * 2) - 1)->toDateString();
        $priorToDate = now()->subDays($horizonDays)->toDateString();

        $dashboard = $this->dashboardAggregateService->overview(
            user: $user,
            companyId: $resolvedCompanyId,
            fromDate: $fromDate,
            toDate: $toDate,
        );
        $priorDashboard = $this->dashboardAggregateService->overview(
            user: $user,
            companyId: $resolvedCompanyId,
            fromDate: $priorFromDate,
            toDate: $priorToDate,
        );
        $payroll = [];
        try {
            $payroll = $this->payrollService->overview($user, [
                'company_id' => $resolvedCompanyId,
            ]);
        } catch (\Throwable) {
            $payroll = [
                'pending_approval' => 0.0,
                'configured' => false,
            ];
        }

        $attendanceToday = [];
        try {
            $attendanceToday = $role === 'agent'
                ? $this->attendanceService->todayForAgent($user, $resolvedCompanyId)
                : $this->attendanceService->metricsForManagement($user, [
                    'company_id' => $resolvedCompanyId,
                    'date' => now()->toDateString(),
                ]);
        } catch (\Throwable) {
            $attendanceToday = [];
        }

        $teamPerformance = null;
        if ($role !== 'agent') {
            try {
                $teamPerformance = $this->teamPerformanceService->analyze($user, $resolvedCompanyId, ['days' => $horizonDays]);
            } catch (\Throwable) {
                $teamPerformance = null;
            }
        }

        $kpis = is_array($dashboard['kpis'] ?? null) ? $dashboard['kpis'] : [];
        $activity = is_array($dashboard['activity_summary'] ?? null) ? $dashboard['activity_summary'] : [];
        $priorActivity = is_array($priorDashboard['activity_summary'] ?? null) ? $priorDashboard['activity_summary'] : [];
        $projectKpis = is_array($dashboard['project_kpis'] ?? null) ? $dashboard['project_kpis'] : [];
        $activityMetric = is_array($dashboard['activity_metric'] ?? null) ? $dashboard['activity_metric'] : [];
        $selfTaskSlices = is_array($dashboard['self_task_slices'] ?? null) ? $dashboard['self_task_slices'] : [];

        $overdueTasks = Task::query()
            ->where('company_id', $resolvedCompanyId)
            ->whereNotNull('due_at')
            ->where('due_at', '<', now())
            ->whereNotIn('status', ['completed', 'cancelled'])
            ->when($role === 'agent', static function ($query) use ($user): void {
                $query->where('assigned_agent_id', (int) $user->id);
            })
            ->count();

        $attendanceToday = is_array($attendanceToday) ? $attendanceToday : [];

        $structuredRecommendations = $this->buildForecastRecommendations(
            role: $role,
            kpis: $kpis,
            activity: $activity,
            projectKpis: $projectKpis,
            payroll: is_array($payroll) ? $payroll : [],
            overdueTasks: (int) $overdueTasks,
            selfTaskSlices: $selfTaskSlices,
            attendanceToday: $attendanceToday,
            teamPerformance: $teamPerformance,
        );

        $recommendations = array_values(array_map(
            static fn (array $item): string => (string) ($item['text'] ?? ''),
            $structuredRecommendations,
        ));

        $tasksCompletedDelta = ((int) ($activity['tasks_completed'] ?? 0)) - ((int) ($priorActivity['tasks_completed'] ?? 0));
        $leadsWonDelta = ((int) ($activity['leads_won'] ?? 0)) - ((int) ($priorActivity['leads_won'] ?? 0));
        $highPriorityCount = count(array_filter(
            $structuredRecommendations,
            static fn (array $item): bool => ($item['priority'] ?? '') === 'high',
        ));
        $confidence = max(0.45, min(0.92, 0.72 - ($highPriorityCount * 0.05)));
        $riskLevel = $highPriorityCount >= 3 ? 'high' : ($highPriorityCount >= 1 ? 'medium' : 'low');

        $snapshot = [
            'kpis' => $kpis,
            'activity_summary' => $activity,
            'project_kpis' => $projectKpis,
            'payroll_overview' => $payroll,
            'attendance_today' => $attendanceToday,
            'signals' => [
                'overdue_tasks' => (int) $overdueTasks,
                'self_task_slices' => $selfTaskSlices,
            ],
            'trends' => [
                'activity_score_change' => $activityMetric['activity_score'] ?? 0,
                'activity_direction' => $activityMetric['direction'] ?? 'flat',
                'tasks_completed_delta' => $tasksCompletedDelta,
                'leads_won_delta' => $leadsWonDelta,
            ],
        ];

        $narrative = $this->generateForecastNarrative(
            role: $role,
            horizonDays: $horizonDays,
            snapshot: $snapshot,
            structuredRecommendations: $structuredRecommendations,
        );

        return [
            'company_id' => $resolvedCompanyId,
            'role' => $role,
            'pipeline' => 'forecast.recommendations.v2',
            'snapshot' => $snapshot,
            'forecast' => [
                'outlook' => match ($horizonDays) {
                    14 => 'next_14_days',
                    30 => 'next_30_days',
                    default => 'next_7_days',
                },
                'horizon_days' => $horizonDays,
                'confidence' => round($confidence, 2),
                'risk_level' => $riskLevel,
                'recommendations' => $recommendations,
                'structured_recommendations' => $structuredRecommendations,
                'narrative' => $narrative,
                'generated_at' => now()->toIso8601String(),
                'trace_id' => (string) Str::uuid(),
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $kpis
     * @param  array<string, mixed>  $activity
     * @param  array<string, mixed>  $projectKpis
     * @param  array<string, mixed>  $payroll
     * @param  array<string, mixed>  $selfTaskSlices
     * @param  array<string, mixed>  $attendanceToday
     * @param  array<string, mixed>|null  $teamPerformance
     * @return list<array{priority: string, area: string, text: string}>
     */
    private function buildForecastRecommendations(
        string $role,
        array $kpis,
        array $activity,
        array $projectKpis,
        array $payroll,
        int $overdueTasks,
        array $selfTaskSlices,
        array $attendanceToday,
        ?array $teamPerformance,
    ): array {
        $recommendations = [];

        if ($overdueTasks > 0) {
            $recommendations[] = $this->forecastRecommendation(
                'high',
                'tasks',
                $role === 'agent'
                    ? "You have {$overdueTasks} overdue task(s). Re-sequence today around the highest-impact overdue items first."
                    : "There are {$overdueTasks} overdue task(s) in scope. Assign recovery owners and clear the oldest overdue work this week.",
            );
        }

        $totalTasks = max(0, (int) ($kpis['total_tasks'] ?? 0));
        $completedTasks = max(0, (int) ($kpis['completed_tasks'] ?? 0));
        if ($totalTasks > 0 && $completedTasks < max(1, (int) floor($totalTasks * 0.5))) {
            $recommendations[] = $this->forecastRecommendation(
                'high',
                'tasks',
                'Task completion ratio is below 50%. Prioritize overdue and in-progress task recovery plans this week.',
            );
        }

        if (((float) ($payroll['pending_approval'] ?? 0.0)) > 0) {
            $recommendations[] = $this->forecastRecommendation(
                'high',
                'payroll',
                'Pending payroll approvals detected. Clear pending approvals to reduce payroll cycle risk.',
            );
        }

        if (((int) ($projectKpis['completion_rate'] ?? 0)) < 40 && ((int) ($projectKpis['total_projects'] ?? 0)) > 0) {
            $recommendations[] = $this->forecastRecommendation(
                'medium',
                'projects',
                'Project completion rate is low. Review at-risk projects and rebalance staffing for critical paths.',
            );
        }

        $leadsCreated = (int) ($activity['leads_created'] ?? 0);
        $leadsWon = (int) ($activity['leads_won'] ?? 0);
        if ($leadsCreated >= 3 && $leadsWon === 0) {
            $recommendations[] = $this->forecastRecommendation(
                'medium',
                'crm',
                'Lead creation is active but no leads were won in this period. Review follow-up cadence and conversion blockers.',
            );
        }

        $absentCount = (int) ($attendanceToday['absent'] ?? $attendanceToday['absent_count'] ?? 0);
        if ($absentCount > 0 && $role !== 'agent') {
            $recommendations[] = $this->forecastRecommendation(
                'medium',
                'attendance',
                "Attendance risk detected with {$absentCount} absent record(s) today. Confirm coverage for critical field work.",
            );
        }

        if ($role === 'agent') {
            $pendingSelfTasks = (int) ($selfTaskSlices['pending'] ?? 0);
            if ($pendingSelfTasks >= 5) {
                $recommendations[] = $this->forecastRecommendation(
                    'medium',
                    'tasks',
                    "You have {$pendingSelfTasks} pending tasks. Block time for the top three before taking new assignments.",
                );
            }
        } elseif (is_array($teamPerformance) && ($teamPerformance['payload']['denied'] ?? false) !== true) {
            $rankings = is_array($teamPerformance['payload']['rankings'] ?? null)
                ? $teamPerformance['payload']['rankings']
                : [];
            $lowestPerformer = $teamPerformance['payload']['lowest_performer'] ?? null;
            if (count($rankings) > 1 && is_array($lowestPerformer) && isset($lowestPerformer['agent_name'])) {
                $recommendations[] = $this->forecastRecommendation(
                    'medium',
                    'team',
                    'Team performance variance detected. Review coaching support for ' . (string) $lowestPerformer['agent_name'] . ' and rebalance workload if needed.',
                );
            }
        }

        if ($recommendations === []) {
            $recommendations[] = $this->forecastRecommendation(
                'low',
                'general',
                'Operational indicators are stable. Maintain current cadence and monitor weekly KPI drift.',
            );
        }

        usort($recommendations, static function (array $left, array $right): int {
            $weights = ['high' => 0, 'medium' => 1, 'low' => 2];

            return ($weights[$left['priority']] ?? 3) <=> ($weights[$right['priority']] ?? 3);
        });

        return $recommendations;
    }

    /**
     * @param  array<string, mixed>  $snapshot
     * @param  list<array{priority: string, area: string, text: string}>  $structuredRecommendations
     */
    private function generateForecastNarrative(
        string $role,
        int $horizonDays,
        array $snapshot,
        array $structuredRecommendations,
    ): ?string {
        $routing = $this->aiProviderRouter->routingMetadata('report');
        $systemPrompt = <<<'PROMPT'
You are ELY, your AI Assistant. Write a concise operational forecast for business leaders using only the provided JSON signals.
Focus on the next planning horizon, key risks, and practical leadership actions.
Use 2-4 short paragraphs in plain business language.
Do not use markdown symbols such as asterisks, hash headings, hyphen bullets, or horizontal rules.
PROMPT;

        $userPrompt = json_encode([
            'role' => $role,
            'horizon_days' => $horizonDays,
            'snapshot' => $snapshot,
            'recommendations' => $structuredRecommendations,
        ], JSON_UNESCAPED_SLASHES);

        $text = $this->aiProviderRouter->generateForPurpose(
            purpose: 'report',
            systemPrompt: $systemPrompt,
            userPrompt: is_string($userPrompt) ? $userPrompt : '{}',
            options: [
                'max_tokens' => 700,
                'temperature' => 0.2,
                'model' => $routing['model'] ?? null,
            ],
        );

        return is_string($text) && trim($text) !== ''
            ? AiPlainTextFormatter::normalize(trim($text))
            : null;
    }

    /**
     * @return array{priority: string, area: string, text: string}
     */
    private function forecastRecommendation(string $priority, string $area, string $text): array
    {
        return [
            'priority' => $priority,
            'area' => $area,
            'text' => $text,
        ];
    }
}
