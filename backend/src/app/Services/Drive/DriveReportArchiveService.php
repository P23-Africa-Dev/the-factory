<?php

declare(strict_types=1);

namespace App\Services\Drive;

use App\Models\Company;
use App\Models\User;
use App\Services\AI\Reporting\WeeklyExecutiveSummaryExporter;

class DriveReportArchiveService
{
    public function __construct(
        private readonly CompanyDriveService $driveService,
        private readonly WeeklyExecutiveSummaryExporter $exporter,
    ) {}

    /**
     * @param  array<string, mixed>  $report
     * @return array<string, mixed>|null
     */
    public function archiveWeeklyExecutiveSummary(
        User $user,
        int $companyId,
        string $reportId,
        array $report,
    ): ?array {
        $companyName = Company::query()->whereKey($companyId)->value('name');
        $pdf = $this->exporter->toPdf($report, is_string($companyName) ? $companyName : null);
        $filename = $this->exporter->buildFilename($report, 'pdf');

        return $this->driveService->archiveElyReport(
            actor: $user,
            reportId: $reportId,
            originalName: $filename,
            pdfContent: $pdf,
            companyId: $companyId,
        );
    }
}
