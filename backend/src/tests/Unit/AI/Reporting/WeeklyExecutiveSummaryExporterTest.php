<?php

declare(strict_types=1);

namespace Tests\Unit\AI\Reporting;

use App\Services\AI\Reporting\WeeklyExecutiveSummaryExporter;
use Tests\TestCase;

final class WeeklyExecutiveSummaryExporterTest extends TestCase
{
    public function test_exports_pdf_and_docx_documents(): void
    {
        $report = [
            'title' => 'Weekly Executive Summary',
            'generated_at' => '2026-06-23T10:30:00+00:00',
            'company_id' => 1,
            'narrative' => "Operations remained stable this week.\n\nLead conversion improved across the pipeline.",
            'metrics' => [
                'kpis' => [
                    'total_tasks' => 42,
                    'completed_tasks' => 30,
                    'active_agents' => 8,
                    'total_leads' => 15,
                    'converted_leads' => 4,
                    'payroll_configured' => true,
                ],
                'project_kpis' => [
                    'total_projects' => 6,
                    'active_projects' => 4,
                    'planning_projects' => 1,
                    'completed_projects' => 1,
                    'completion_rate' => 16.67,
                ],
                'activity_summary' => [
                    'range' => [
                        'from_date' => '2026-06-16',
                        'to_date' => '2026-06-23',
                    ],
                    'tasks_created' => 12,
                    'tasks_completed' => 9,
                    'leads_created' => 5,
                    'leads_won' => 2,
                ],
            ],
        ];

        $exporter = app(WeeklyExecutiveSummaryExporter::class);

        $pdf = $exporter->toPdf($report, 'Acme Manufacturing');
        $word = $exporter->toWordDocument($report, 'Acme Manufacturing');

        $this->assertStringStartsWith('%PDF', $pdf);
        $this->assertStringStartsWith('{\\rtf1', $word);
        $this->assertSame('Weekly-Executive-Summary-2026-06-23.pdf', $exporter->buildFilename($report, 'pdf'));
        $this->assertSame('Weekly-Executive-Summary-2026-06-23.doc', $exporter->buildFilename($report, 'docx'));
    }
}
