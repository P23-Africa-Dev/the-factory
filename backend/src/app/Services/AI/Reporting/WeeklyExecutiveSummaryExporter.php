<?php

declare(strict_types=1);

namespace App\Services\AI\Reporting;

use Carbon\Carbon;
use Dompdf\Dompdf;
use Dompdf\Options;

class WeeklyExecutiveSummaryExporter
{
    /**
     * @param  array<string, mixed>  $report
     */
    public function toPdf(array $report, ?string $companyName = null): string
    {
        $options = new Options();
        $options->set('isRemoteEnabled', false);
        $options->set('defaultFont', 'Helvetica');

        $dompdf = new Dompdf($options);
        $dompdf->loadHtml($this->buildHtml($report, $companyName));
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();

        return (string) $dompdf->output();
    }

    /**
     * Word-compatible RTF document (opens in Microsoft Word).
     *
     * @param  array<string, mixed>  $report
     */
    public function toWordDocument(array $report, ?string $companyName = null): string
    {
        $metrics = is_array($report['metrics'] ?? null) ? $report['metrics'] : [];
        $parts = [
            $this->rtfHeading((string) ($report['title'] ?? 'Weekly Executive Summary'), 36),
            $this->rtfParagraph($this->buildSubtitle($report, $companyName), italic: true, size: 20),
            '',
        ];

        $narrative = is_string($report['narrative'] ?? null) ? trim((string) $report['narrative']) : '';
        if ($narrative !== '') {
            $parts[] = $this->rtfHeading('Executive Summary', 26);
            foreach ($this->splitParagraphs($narrative) as $paragraph) {
                $parts[] = $this->rtfParagraph($paragraph);
                $parts[] = '';
            }
        }

        $parts[] = $this->rtfMetricSection('Key Performance Indicators', $this->formatKpis($metrics['kpis'] ?? []));
        $parts[] = $this->rtfMetricSection('Project Performance', $this->formatProjectKpis($metrics['project_kpis'] ?? []));
        $parts[] = $this->rtfMetricSection('Activity Summary', $this->formatActivitySummary($metrics['activity_summary'] ?? []));
        $parts[] = $this->rtfParagraph('Prepared by ELY, your AI Assistant', italic: true, size: 18, align: 'center');

        return '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Calibri;}}\\f0' . implode('\\par ', array_filter($parts, static fn (string $part): bool => $part !== '')) . '}';
    }

    /**
     * @param  array<string, mixed>  $report
     */
    public function buildFilename(array $report, string $format): string
    {
        $date = $this->resolveGeneratedDate($report)->format('Y-m-d');

        return match ($format) {
            'docx', 'word' => "Weekly-Executive-Summary-{$date}.doc",
            default => "Weekly-Executive-Summary-{$date}.pdf",
        };
    }

    /**
     * @param  array<string, mixed>  $report
     */
    private function buildHtml(array $report, ?string $companyName): string
    {
        $title = htmlspecialchars((string) ($report['title'] ?? 'Weekly Executive Summary'), ENT_QUOTES, 'UTF-8');
        $subtitle = htmlspecialchars($this->buildSubtitle($report, $companyName), ENT_QUOTES, 'UTF-8');
        $metrics = is_array($report['metrics'] ?? null) ? $report['metrics'] : [];

        $sections = [];
        $narrative = is_string($report['narrative'] ?? null) ? trim((string) $report['narrative']) : '';
        if ($narrative !== '') {
            $paragraphs = array_map(
                static fn (string $paragraph): string => '<p>' . nl2br(htmlspecialchars($paragraph, ENT_QUOTES, 'UTF-8')) . '</p>',
                $this->splitParagraphs($narrative),
            );
            $sections[] = '<h2>Executive Summary</h2>' . implode('', $paragraphs);
        }

        $sections[] = $this->buildHtmlTable('Key Performance Indicators', $this->formatKpis($metrics['kpis'] ?? []));
        $sections[] = $this->buildHtmlTable('Project Performance', $this->formatProjectKpis($metrics['project_kpis'] ?? []));
        $sections[] = $this->buildHtmlTable('Activity Summary', $this->formatActivitySummary($metrics['activity_summary'] ?? []));

        $body = implode('', $sections);

        return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Helvetica, Arial, sans-serif; color: #1f2937; font-size: 11pt; line-height: 1.5; }
        h1 { color: #1f4e5f; font-size: 22pt; margin: 0 0 6px; }
        .meta { color: #5f6b7a; font-size: 10pt; margin-bottom: 24px; }
        h2 { color: #1f4e5f; font-size: 13pt; margin: 22px 0 10px; border-bottom: 1px solid #d7dee8; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        th, td { border: 1px solid #d7dee8; padding: 8px 10px; text-align: left; }
        th { background: #f3f6f9; color: #1f4e5f; width: 42%; }
        p { margin: 0 0 10px; }
        .footer { margin-top: 28px; text-align: center; color: #5f6b7a; font-size: 9pt; font-style: italic; }
    </style>
</head>
<body>
    <h1>{$title}</h1>
    <div class="meta">{$subtitle}</div>
    {$body}
    <div class="footer">Prepared by ELY, your AI Assistant</div>
</body>
</html>
HTML;
    }

    /**
     * @param  array<string, mixed>  $report
     */
    private function buildSubtitle(array $report, ?string $companyName): string
    {
        $parts = [];
        if (is_string($companyName) && trim($companyName) !== '') {
            $parts[] = trim($companyName);
        }

        $parts[] = 'Generated ' . $this->resolveGeneratedDate($report)->format('F j, Y \a\t g:i A');

        $activity = is_array($report['metrics']['activity_summary'] ?? null) ? $report['metrics']['activity_summary'] : [];
        $range = is_array($activity['range'] ?? null) ? $activity['range'] : [];
        $fromDate = is_string($range['from_date'] ?? null) ? $range['from_date'] : null;
        $toDate = is_string($range['to_date'] ?? null) ? $range['to_date'] : null;
        if ($fromDate && $toDate) {
            $parts[] = "Reporting period: {$fromDate} to {$toDate}";
        }

        return implode(' • ', $parts);
    }

    /**
     * @param  array<string, mixed>  $report
     */
    private function resolveGeneratedDate(array $report): Carbon
    {
        $generatedAt = $report['generated_at'] ?? null;

        if (is_string($generatedAt) && trim($generatedAt) !== '') {
            try {
                return Carbon::parse($generatedAt);
            } catch (\Throwable) {
                // Fall through to now().
            }
        }

        return now();
    }

    /**
     * @return list<string>
     */
    private function splitParagraphs(string $text): array
    {
        $chunks = preg_split("/\n{2,}/", trim($text)) ?: [];

        return array_values(array_filter(array_map('trim', $chunks), static fn (string $chunk): bool => $chunk !== ''));
    }

    /**
     * @param  array<string, mixed>  $kpis
     * @return list<array{label: string, value: string}>
     */
    private function formatKpis(array $kpis): array
    {
        $labels = [
            'total_tasks' => 'Total Tasks',
            'completed_tasks' => 'Completed Tasks',
            'active_agents' => 'Active Agents',
            'total_leads' => 'Total Leads',
            'converted_leads' => 'Converted Leads',
            'payroll_configured' => 'Payroll Configured',
        ];

        $rows = [];
        foreach ($labels as $key => $label) {
            if (! array_key_exists($key, $kpis)) {
                continue;
            }

            $rows[] = [
                'label' => $label,
                'value' => $this->formatScalarValue($kpis[$key]),
            ];
        }

        return $rows;
    }

    /**
     * @param  array<string, mixed>  $projectKpis
     * @return list<array{label: string, value: string}>
     */
    private function formatProjectKpis(array $projectKpis): array
    {
        $labels = [
            'total_projects' => 'Total Projects',
            'active_projects' => 'Active Projects',
            'planning_projects' => 'Projects in Planning',
            'completed_projects' => 'Completed Projects',
            'completion_rate' => 'Completion Rate',
        ];

        $rows = [];
        foreach ($labels as $key => $label) {
            if (! array_key_exists($key, $projectKpis)) {
                continue;
            }

            $value = $projectKpis[$key];
            if ($key === 'completion_rate' && is_numeric($value)) {
                $value = rtrim(rtrim(number_format((float) $value, 2, '.', ''), '0'), '.') . '%';
            }

            $rows[] = [
                'label' => $label,
                'value' => $this->formatScalarValue($value),
            ];
        }

        return $rows;
    }

    /**
     * @param  array<string, mixed>  $activitySummary
     * @return list<array{label: string, value: string}>
     */
    private function formatActivitySummary(array $activitySummary): array
    {
        $labels = [
            'tasks_created' => 'Tasks Created',
            'tasks_completed' => 'Tasks Completed',
            'leads_created' => 'Leads Created',
            'leads_won' => 'Leads Won',
        ];

        $rows = [];
        $range = is_array($activitySummary['range'] ?? null) ? $activitySummary['range'] : [];
        $fromDate = is_string($range['from_date'] ?? null) ? $range['from_date'] : null;
        $toDate = is_string($range['to_date'] ?? null) ? $range['to_date'] : null;
        if ($fromDate && $toDate) {
            $rows[] = ['label' => 'Period', 'value' => "{$fromDate} to {$toDate}"];
        }

        foreach ($labels as $key => $label) {
            if (! array_key_exists($key, $activitySummary)) {
                continue;
            }

            $rows[] = [
                'label' => $label,
                'value' => $this->formatScalarValue($activitySummary[$key]),
            ];
        }

        return $rows;
    }

    private function formatScalarValue(mixed $value): string
    {
        if (is_bool($value)) {
            return $value ? 'Yes' : 'No';
        }

        if (is_numeric($value)) {
            return (string) $value;
        }

        if (is_string($value)) {
            return trim($value) !== '' ? trim($value) : '—';
        }

        return '—';
    }

    /**
     * @param  list<array{label: string, value: string}>  $rows
     */
    private function buildHtmlTable(string $heading, array $rows): string
    {
        if ($rows === []) {
            return '';
        }

        $headingHtml = htmlspecialchars($heading, ENT_QUOTES, 'UTF-8');
        $body = '';
        foreach ($rows as $row) {
            $label = htmlspecialchars($row['label'], ENT_QUOTES, 'UTF-8');
            $value = htmlspecialchars($row['value'], ENT_QUOTES, 'UTF-8');
            $body .= "<tr><th>{$label}</th><td>{$value}</td></tr>";
        }

        return "<h2>{$headingHtml}</h2><table>{$body}</table>";
    }

    /**
     * @param  list<array{label: string, value: string}>  $rows
     */
    private function rtfMetricSection(string $heading, array $rows): string
    {
        if ($rows === []) {
            return '';
        }

        $lines = [$this->rtfHeading($heading, 26)];
        foreach ($rows as $row) {
            $lines[] = $this->rtfParagraph("{$row['label']}: {$row['value']}", boldLabel: $row['label']);
        }

        return implode(' ', $lines);
    }

    private function rtfHeading(string $text, int $size): string
    {
        return '\\b\\fs' . $size . ' ' . $this->escapeRtf($text) . '\\b0\\fs22';
    }

    private function rtfParagraph(
        string $text,
        bool $italic = false,
        int $size = 22,
        ?string $align = null,
        ?string $boldLabel = null,
    ): string {
        $prefix = '';
        if ($align === 'center') {
            $prefix = '\\qc ';
        }

        $escaped = $this->escapeRtf($text);
        if (is_string($boldLabel) && $boldLabel !== '' && str_starts_with($text, $boldLabel . ':')) {
            $value = substr($text, strlen($boldLabel) + 2);
            $escaped = '\\b ' . $this->escapeRtf($boldLabel) . '\\b0: ' . $this->escapeRtf($value);
        }

        $style = '\\fs' . $size;
        if ($italic) {
            $style .= '\\i';
        }

        $suffix = $italic ? '\\i0' : '';

        return $prefix . $style . ' ' . $escaped . $suffix;
    }

    private function escapeRtf(string $text): string
    {
        $text = str_replace(['\\', '{', '}'], ['\\\\', '\\{', '\\}'], $text);

        return preg_replace_callback(
            '/[^\x00-\x7F]/',
            static fn (array $matches): string => '\\u' . mb_ord($matches[0], 'UTF-8') . '?',
            $text,
        ) ?? $text;
    }
}
