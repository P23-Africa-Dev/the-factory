<?php

declare(strict_types=1);

namespace App\Services\AI\Reporting;

use App\Models\User;
use App\Services\AI\Analytics\ExecutiveAnalyticsService;
use App\Services\AI\Providers\AiProviderRouter;
use App\Services\Company\CompanyContextService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ExecutiveReportService
{
    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly ExecutiveAnalyticsService $executiveAnalyticsService,
        private readonly AiProviderRouter $aiProviderRouter,
    ) {}

    public function queueWeeklySummary(User $user, ?int $companyId = null, ?string $fromDate = null, ?string $toDate = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $reportId = (string) Str::uuid();

        $this->storeStatus($resolvedCompanyId, (int) $user->id, $reportId, [
            'report_id' => $reportId,
            'status' => 'queued',
            'progress' => 5,
            'from_date' => $fromDate,
            'to_date' => $toDate,
            'created_at' => now()->toIso8601String(),
            'updated_at' => now()->toIso8601String(),
            'download_ready' => false,
            'report' => null,
        ]);

        return [
            'report_id' => $reportId,
            'company_id' => $resolvedCompanyId,
        ];
    }

    public function markRunning(int $companyId, int $userId, string $reportId): void
    {
        $status = $this->statusByIds($companyId, $userId, $reportId);

        $this->storeStatus($companyId, $userId, $reportId, [
            ...$status,
            'status' => 'running',
            'progress' => 35,
            'updated_at' => now()->toIso8601String(),
        ]);
    }

    public function markCompleted(int $companyId, int $userId, string $reportId, array $report): void
    {
        $status = $this->statusByIds($companyId, $userId, $reportId);

        $this->storeStatus($companyId, $userId, $reportId, [
            ...$status,
            'status' => 'completed',
            'progress' => 100,
            'updated_at' => now()->toIso8601String(),
            'download_ready' => true,
            'report' => $report,
        ]);
    }

    public function markFailed(int $companyId, int $userId, string $reportId, string $error): void
    {
        $status = $this->statusByIds($companyId, $userId, $reportId);

        $this->storeStatus($companyId, $userId, $reportId, [
            ...$status,
            'status' => 'failed',
            'progress' => 100,
            'updated_at' => now()->toIso8601String(),
            'download_ready' => false,
            'error' => $error,
        ]);
    }

    public function buildWeeklySummary(User $user, int $companyId, ?string $fromDate = null, ?string $toDate = null): array
    {
        $pack = $this->executiveAnalyticsService->contextPack($user, $companyId, $fromDate, $toDate);

        $kpis = is_array($pack['dashboard_overview']['kpis'] ?? null) ? $pack['dashboard_overview']['kpis'] : [];
        $projectKpis = is_array($pack['dashboard_overview']['project_kpis'] ?? null) ? $pack['dashboard_overview']['project_kpis'] : [];
        $activitySummary = is_array($pack['dashboard_overview']['activity_summary'] ?? null)
            ? $pack['dashboard_overview']['activity_summary']
            : [];

        $routing = $this->aiProviderRouter->routingMetadata('report');
        $narrative = $this->generateExecutiveNarrative($pack, $routing);

        return [
            'title' => 'Weekly Executive Summary',
            'generated_at' => now()->toIso8601String(),
            'company_id' => $companyId,
            'metrics' => [
                'kpis' => $kpis,
                'project_kpis' => $projectKpis,
                'activity_summary' => $activitySummary,
                'payroll_overview' => $pack['payroll_overview'] ?? [],
                'attendance_today' => $pack['attendance_today'] ?? [],
            ],
            'context_pack' => $pack,
            'narrative' => $narrative,
            'routing' => $routing,
        ];
    }

    public function statusForUser(User $user, string $reportId, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);

        return $this->statusByIds((int) $context['company']->id, (int) $user->id, $reportId);
    }

    public function downloadPayloadForUser(User $user, string $reportId, ?int $companyId = null): array
    {
        $status = $this->statusForUser($user, $reportId, $companyId);

        if (($status['status'] ?? null) !== 'completed' || ! is_array($status['report'] ?? null)) {
            throw new HttpException(409, 'Report is not ready for download yet.');
        }

        $content = json_encode($status['report'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

        return [
            'filename' => sprintf('copilot-weekly-summary-%s.json', $reportId),
            'content_type' => 'application/json',
            'content' => $content === false ? '{}' : $content,
        ];
    }

    /**
     * @param  array<string, mixed>  $pack
     * @param  array{provider: string, model: string, purpose: string}  $routing
     */
    private function generateExecutiveNarrative(array $pack, array $routing): ?string
    {
        $systemPrompt = <<<'PROMPT'
You are ELY, your AI Assistant. Write a concise weekly executive narrative from the provided operational metrics JSON.
Focus on KPI trends, risks, and recommended leadership actions. Do not invent metrics not present in the data.
Use 3-5 short paragraphs in plain business language.
PROMPT;

        $userPrompt = "Weekly executive metrics JSON:\n" . json_encode($pack, JSON_UNESCAPED_SLASHES);

        $text = $this->aiProviderRouter->generateForPurpose(
            purpose: 'report',
            systemPrompt: $systemPrompt,
            userPrompt: $userPrompt,
            options: ['max_tokens' => 900, 'temperature' => 0.2, 'model' => $routing['model']],
        );

        return is_string($text) && trim($text) !== '' ? trim($text) : null;
    }

    private function statusByIds(int $companyId, int $userId, string $reportId): array
    {
        $status = Cache::get($this->statusKey($companyId, $userId, $reportId));

        if (! is_array($status)) {
            throw new HttpException(404, 'Weekly report was not found in your scope.');
        }

        return $status;
    }

    private function storeStatus(int $companyId, int $userId, string $reportId, array $status): void
    {
        Cache::put($this->statusKey($companyId, $userId, $reportId), $status, now()->addDays(7));
    }

    private function statusKey(int $companyId, int $userId, string $reportId): string
    {
        return "copilot:report:weekly:{$companyId}:{$userId}:{$reportId}";
    }
}
