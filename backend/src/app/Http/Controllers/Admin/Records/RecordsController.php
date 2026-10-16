<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Records;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ExportRecordsRequest;
use App\Models\Company;
use App\Models\RecordDisclosure;
use App\Models\User;
use App\Services\Records\RecordDisclosureLogger;
use App\Services\Records\RecordFilters;
use App\Services\Records\RecordsCatalog;
use App\Services\Records\RecordsReportService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Illuminate\View\View;

class RecordsController extends Controller
{
    public function __construct(
        private readonly RecordsReportService $reports,
        private readonly RecordDisclosureLogger $disclosures,
    ) {}

    public function index(): View
    {
        return view('admin.records.index', [
            'reports' => RecordsCatalog::reports(),
        ]);
    }

    public function show(Request $request, string $report): View
    {
        abort_unless(RecordsCatalog::has($report), 404);

        $filters = $this->normalize($report, RecordFilters::fromRequest($request));
        $page = $this->reports->page($report, $filters);
        $this->disclosures->record(
            report: $report,
            action: RecordDisclosure::ACTION_VIEW,
            filters: $filters,
            rowCount: $page['rows']->total(),
        );

        return view('admin.records.show', [
            'report' => $report,
            'meta' => RecordsCatalog::get($report),
            'filters' => $filters,
            'columns' => $page['columns'],
            'rows' => $page['rows'],
            'companies' => $this->companies(),
            'requesterTypes' => RecordDisclosure::REQUESTER_TYPES,
            'taskRetentionDays' => (int) config('tracking.retention_days', 90),
            'fieldRetentionDays' => (int) config('field_activity.retention_days', 90),
        ]);
    }

    public function export(ExportRecordsRequest $request, string $report): StreamedResponse
    {
        abort_unless(RecordsCatalog::has($report), 404);

        $filters = $this->normalize($report, RecordFilters::fromArray($request->validated()));
        $disclosure = $this->disclosures->record(
            report: $report,
            action: RecordDisclosure::ACTION_EXPORT,
            filters: $filters,
            rowCount: null,
            requesterType: (string) $request->validated('requester_type'),
            reference: $request->validated('reference'),
            note: (string) $request->validated('note'),
        );
        $rowCount = $this->reports->count($report, $filters);
        $disclosure->update(['row_count' => $rowCount]);

        $filename = sprintf(
            'records-%s-%s-to-%s.csv',
            $report,
            $filters->from->toDateString(),
            $filters->to->toDateString(),
        );

        return $this->csvResponse($filename, function () use ($report, $filters): void {
            $handle = fopen('php://output', 'w');
            $this->reports->writeCsv($handle, $report, $filters);
            fclose($handle);
        });
    }

    public function person(Request $request): View
    {
        $filters = RecordFilters::fromRequest($request);
        $pack = $this->reports->personPack($filters, true);
        $matches = [];

        if ($pack === null && $filters->person !== null && $filters->userId === null) {
            $matches = $this->reports->personMatches($filters->person);
            if (count($matches) === 1) {
                $filters = new RecordFilters(
                    from: $filters->from,
                    to: $filters->to,
                    companyId: $filters->companyId,
                    person: $filters->person,
                    slice: $filters->slice,
                    userId: $matches[0]['id'],
                );
                $pack = $this->reports->personPack($filters, true);
                $matches = [];
            }
        }

        if ($pack !== null) {
            $filters = new RecordFilters(
                from: $filters->from,
                to: $filters->to,
                companyId: $filters->companyId,
                person: $filters->person,
                slice: null,
                userId: (int) $pack['user']->id,
            );
            $this->disclosures->record(
                report: 'person',
                action: RecordDisclosure::ACTION_VIEW,
                filters: $filters,
                rowCount: $this->packRowCount($pack),
            );
        }

        return view('admin.records.person', [
            'filters' => $filters,
            'pack' => $pack,
            'matches' => $matches,
            'companies' => $this->companies(),
            'requesterTypes' => RecordDisclosure::REQUESTER_TYPES,
            'taskRetentionDays' => (int) config('tracking.retention_days', 90),
            'fieldRetentionDays' => (int) config('field_activity.retention_days', 90),
            'missingUser' => $filters->userId !== null && $pack === null,
        ]);
    }

    public function exportPerson(ExportRecordsRequest $request): StreamedResponse
    {
        $filters = RecordFilters::fromArray($request->validated());
        $pack = $this->reports->personPack($filters, false);
        abort_if($pack === null, 404);

        $filters = new RecordFilters(
            from: $filters->from,
            to: $filters->to,
            companyId: $filters->companyId,
            person: $filters->person,
            slice: null,
            userId: (int) $pack['user']->id,
        );

        $this->disclosures->record(
            report: 'person',
            action: RecordDisclosure::ACTION_EXPORT,
            filters: $filters,
            rowCount: $this->packRowCount($pack),
            requesterType: (string) $request->validated('requester_type'),
            reference: $request->validated('reference'),
            note: (string) $request->validated('note'),
        );

        $email = preg_replace('/[^a-z0-9.@_-]+/i', '-', (string) $pack['user']->email) ?: 'person';
        $filename = sprintf('records-person-%s-%s-to-%s.csv', $email, $filters->from->toDateString(), $filters->to->toDateString());

        return $this->csvResponse($filename, function () use ($pack): void {
            $handle = fopen('php://output', 'w');
            $this->reports->writePersonCsv($handle, $pack);
            fclose($handle);
        });
    }

    /**
     * @param  array{user: User, memberships: list<array<string, string>>, sections: list<array{total: int}>}  $pack
     */
    private function packRowCount(array $pack): int
    {
        $sectionRows = array_sum(array_map(static fn (array $section): int => (int) $section['total'], $pack['sections']));

        return 1 + count($pack['memberships']) + $sectionRows;
    }

    private function normalize(string $report, RecordFilters $filters): RecordFilters
    {
        return new RecordFilters(
            from: $filters->from,
            to: $filters->to,
            companyId: $filters->companyId,
            person: $filters->person,
            slice: RecordsCatalog::normalizeSlice($report, $filters->slice),
            userId: $filters->userId,
        );
    }

    /**
     * @return \Illuminate\Support\Collection<int, Company>
     */
    private function companies()
    {
        return Company::query()->orderBy('name')->get(['id', 'name', 'company_id']);
    }

    private function csvResponse(string $filename, callable $writer): StreamedResponse
    {
        return response()->streamDownload(function () use ($writer): void {
            echo "\xEF\xBB\xBF";
            $writer();
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }
}
