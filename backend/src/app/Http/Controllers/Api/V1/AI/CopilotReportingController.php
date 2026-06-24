<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\AI;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Jobs\GenerateWeeklyExecutiveSummaryJob;
use App\Services\AI\Analytics\ExecutiveAnalyticsService;
use App\Services\AI\Reporting\ExecutiveReportService;
use App\Services\Notification\NotificationRealtimeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class CopilotReportingController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(
        private readonly ExecutiveAnalyticsService $executiveAnalyticsService,
        private readonly ExecutiveReportService $executiveReportService,
        private readonly NotificationRealtimeService $notificationRealtimeService,
    ) {}

    public function contextPack(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable'],
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date', 'after_or_equal:from_date'],
        ]);

        $contextPack = $this->executiveAnalyticsService->contextPack(
            user: $request->user(),
            companyId: $this->resolveCompanyContextId($validated['company_id'] ?? null),
            fromDate: isset($validated['from_date']) ? (string) $validated['from_date'] : null,
            toDate: isset($validated['to_date']) ? (string) $validated['to_date'] : null,
        );

        return $this->success(
            message: 'Executive analytics context pack generated successfully.',
            data: $contextPack,
        );
    }

    public function queueWeeklySummary(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable'],
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date', 'after_or_equal:from_date'],
        ]);

        $queued = $this->executiveReportService->queueWeeklySummary(
            user: $request->user(),
            companyId: $this->resolveCompanyContextId($validated['company_id'] ?? null),
            fromDate: isset($validated['from_date']) ? (string) $validated['from_date'] : null,
            toDate: isset($validated['to_date']) ? (string) $validated['to_date'] : null,
        );

        GenerateWeeklyExecutiveSummaryJob::dispatch(
            companyId: (int) $queued['company_id'],
            userId: (int) $request->user()->id,
            reportId: (string) $queued['report_id'],
            fromDate: isset($validated['from_date']) ? (string) $validated['from_date'] : null,
            toDate: isset($validated['to_date']) ? (string) $validated['to_date'] : null,
        );

        $this->notificationRealtimeService->publishToUser((int) $request->user()->id, 'copilot.reports.weekly.progress', [
            'report_id' => (string) $queued['report_id'],
            'status' => 'queued',
            'progress' => 5,
        ]);

        return $this->success(
            message: 'Weekly executive summary generation queued successfully.',
            data: $queued,
            status: 202,
        );
    }

    public function weeklySummaryStatus(Request $request, string $reportId): JsonResponse
    {
        $status = $this->executiveReportService->statusForUser(
            user: $request->user(),
            reportId: $reportId,
            companyId: $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Weekly summary status fetched successfully.',
            data: $status,
        );
    }

    public function downloadWeeklySummary(Request $request, string $reportId): StreamedResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable'],
            'format' => ['nullable', 'in:pdf,docx'],
        ]);

        $download = $this->executiveReportService->downloadPayloadForUser(
            user: $request->user(),
            reportId: $reportId,
            companyId: $this->resolveCompanyContextId($validated['company_id'] ?? $request->input('company_id')),
            format: (string) ($validated['format'] ?? 'pdf'),
        );

        return response()->streamDownload(
            static function () use ($download): void {
                echo (string) $download['content'];
            },
            (string) $download['filename'],
            [
                'Content-Type' => (string) $download['content_type'],
                'Cache-Control' => 'no-store, no-cache, must-revalidate',
                'Pragma' => 'no-cache',
                'X-Content-Type-Options' => 'nosniff',
            ],
        );
    }
}
