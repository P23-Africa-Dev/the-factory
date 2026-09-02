<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Company;
use App\Services\FieldActivity\FieldActivityAlertService;
use App\Services\FieldActivity\FieldDailySummaryService;
use App\Models\FieldDailySummary;
use Illuminate\Console\Command;

class FieldActivityEodCommand extends Command
{
    protected $signature = 'field-activity:eod {--company_id= : Limit to a company} {--narrative : Generate AI narratives}';

    protected $description = 'Close stale field sessions past EOD, scan alerts, optionally attach narratives.';

    public function __construct(
        private readonly FieldActivityAlertService $alertService,
        private readonly FieldDailySummaryService $dailySummaryService,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $companyId = $this->option('company_id') !== null ? (int) $this->option('company_id') : null;
        $withNarrative = (bool) $this->option('narrative');

        $closed = $this->alertService->closeSessionsPastEod($companyId);

        $alertTotals = ['long_stationary' => 0, 'missed_visits' => 0];
        $companies = Company::query()
            ->where('field_activity_enabled', true)
            ->when($companyId !== null, fn ($q) => $q->where('id', $companyId))
            ->get();

        foreach ($companies as $company) {
            $result = $this->alertService->scanCompany($company);
            $alertTotals['long_stationary'] += $result['long_stationary'];
            $alertTotals['missed_visits'] += $result['missed_visits'];
        }

        $narratives = 0;
        if ($withNarrative) {
            $summaries = FieldDailySummary::query()
                ->whereDate('summary_date', now()->toDateString())
                ->whereNull('narrative')
                ->when($companyId !== null, fn ($q) => $q->where('company_id', $companyId))
                ->limit(200)
                ->get();

            foreach ($summaries as $summary) {
                $this->dailySummaryService->attachNarrative($summary);
                $narratives++;
            }
        }

        $this->info("field-activity:eod closed={$closed} long_stationary={$alertTotals['long_stationary']} missed_visits={$alertTotals['missed_visits']} narratives={$narratives}");

        return self::SUCCESS;
    }
}
