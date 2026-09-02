<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\User;
use App\Services\AI\Reporting\ExecutiveReportService;
use App\Services\Notification\NotificationRealtimeService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

class GenerateWeeklyExecutiveSummaryJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public function __construct(
        public readonly int $companyId,
        public readonly int $userId,
        public readonly string $reportId,
        public readonly ?string $fromDate = null,
        public readonly ?string $toDate = null,
    ) {}

    public function handle(
        ExecutiveReportService $executiveReportService,
        NotificationRealtimeService $notificationRealtimeService,
        \App\Services\Drive\DriveReportArchiveService $driveReportArchiveService,
    ): void {
        $user = User::query()->findOrFail($this->userId);

        $notificationRealtimeService->publishToUser($this->userId, 'copilot.reports.weekly.progress', [
            'report_id' => $this->reportId,
            'status' => 'running',
            'progress' => 35,
        ]);

        $executiveReportService->markRunning($this->companyId, $this->userId, $this->reportId);

        try {
            $report = $executiveReportService->buildWeeklySummary(
                user: $user,
                companyId: $this->companyId,
                fromDate: $this->fromDate,
                toDate: $this->toDate,
            );

            $executiveReportService->markCompleted($this->companyId, $this->userId, $this->reportId, $report);

            try {
                $archived = $driveReportArchiveService->archiveWeeklyExecutiveSummary(
                    user: $user,
                    companyId: $this->companyId,
                    reportId: $this->reportId,
                    report: $report,
                );

                if (isset($archived['id'])) {
                    $executiveReportService->attachDriveFileId(
                        $this->companyId,
                        $this->userId,
                        $this->reportId,
                        (int) $archived['id'],
                    );
                }
            } catch (Throwable $archiveException) {
                report($archiveException);
            }

            $notificationRealtimeService->publishToUser($this->userId, 'copilot.reports.weekly.progress', [
                'report_id' => $this->reportId,
                'status' => 'completed',
                'progress' => 100,
            ]);
        } catch (Throwable $exception) {
            $executiveReportService->markFailed($this->companyId, $this->userId, $this->reportId, $exception->getMessage());

            $notificationRealtimeService->publishToUser($this->userId, 'copilot.reports.weekly.progress', [
                'report_id' => $this->reportId,
                'status' => 'failed',
                'progress' => 100,
                'error' => $exception->getMessage(),
            ]);

            throw $exception;
        }
    }
}
