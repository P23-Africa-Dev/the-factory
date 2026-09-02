<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Company;
use App\Models\Lead;
use App\Models\LeadLabel;
use App\Models\LeadPipeline;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class AuditCrmLeadVisibilityCommand extends Command
{
    protected $signature = 'crm:audit-lead-visibility
        {company : Company numeric ID, public company ID, or exact name}
        {--repair : Reassign invalid statuses and pipelines to company defaults}';

    protected $description = 'Audit and optionally repair CRM leads that cannot appear in pipeline stages';

    public function handle(): int
    {
        $company = $this->resolveCompany((string) $this->argument('company'));
        if (! $company) {
            $this->error('Company not found.');

            return self::FAILURE;
        }

        $defaultLabel = LeadLabel::query()
            ->where('company_id', $company->id)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->first();
        $defaultPipeline = LeadPipeline::query()
            ->where('company_id', $company->id)
            ->where('is_default', true)
            ->orderBy('id')
            ->first()
            ?? LeadPipeline::query()
                ->where('company_id', $company->id)
                ->orderBy('sort_order')
                ->orderBy('id')
                ->first();

        if (! $defaultLabel || ! $defaultPipeline) {
            $this->error('The company must have at least one CRM label and pipeline before repair.');

            return self::FAILURE;
        }

        $before = $this->visibilityReport((int) $company->id);
        $this->renderReport($company, $before, 'Current visibility');

        if (! $this->option('repair')) {
            return ($before['invalid_statuses'] + $before['invalid_pipelines'] + $before['null_pipelines']) > 0
                ? self::INVALID
                : self::SUCCESS;
        }

        DB::transaction(function () use ($company, $defaultLabel, $defaultPipeline): void {
            Lead::query()
                ->where('company_id', $company->id)
                ->whereNotExists(function ($query): void {
                    $query->selectRaw('1')
                        ->from('lead_labels')
                        ->whereColumn('lead_labels.company_id', 'leads.company_id')
                        ->whereColumn('lead_labels.slug', 'leads.status');
                })
                ->update(['status' => $defaultLabel->slug]);

            Lead::query()
                ->where('company_id', $company->id)
                ->where(function ($query): void {
                    $query->whereNull('pipeline_id')
                        ->orWhereNotExists(function ($subquery): void {
                            $subquery->selectRaw('1')
                                ->from('lead_pipelines')
                                ->whereColumn('lead_pipelines.company_id', 'leads.company_id')
                                ->whereColumn('lead_pipelines.id', 'leads.pipeline_id');
                        });
                })
                ->update(['pipeline_id' => $defaultPipeline->id]);
        });

        $after = $this->visibilityReport((int) $company->id);
        $this->renderReport($company, $after, 'After repair');
        $this->info("Invalid records were reassigned to '{$defaultPipeline->name}' / '{$defaultLabel->name}'.");

        return self::SUCCESS;
    }

    private function resolveCompany(string $value): ?Company
    {
        return Company::query()
            ->where(function ($query) use ($value): void {
                if (ctype_digit($value)) {
                    $query->whereKey((int) $value);
                }
                $query->orWhere('company_id', $value)
                    ->orWhereRaw('LOWER(name) = ?', [mb_strtolower($value)]);
            })
            ->first();
    }

    /**
     * @return array{active:int,soft_deleted:int,invalid_statuses:int,invalid_pipelines:int,null_pipelines:int}
     */
    private function visibilityReport(int $companyId): array
    {
        $active = Lead::query()->where('company_id', $companyId);

        return [
            'active' => (clone $active)->count(),
            'soft_deleted' => Lead::onlyTrashed()->where('company_id', $companyId)->count(),
            'invalid_statuses' => (clone $active)
                ->whereNotExists(function ($query): void {
                    $query->selectRaw('1')
                        ->from('lead_labels')
                        ->whereColumn('lead_labels.company_id', 'leads.company_id')
                        ->whereColumn('lead_labels.slug', 'leads.status');
                })
                ->count(),
            'invalid_pipelines' => (clone $active)
                ->whereNotNull('pipeline_id')
                ->whereNotExists(function ($query): void {
                    $query->selectRaw('1')
                        ->from('lead_pipelines')
                        ->whereColumn('lead_pipelines.company_id', 'leads.company_id')
                        ->whereColumn('lead_pipelines.id', 'leads.pipeline_id');
                })
                ->count(),
            'null_pipelines' => (clone $active)->whereNull('pipeline_id')->count(),
        ];
    }

    /**
     * @param array{active:int,soft_deleted:int,invalid_statuses:int,invalid_pipelines:int,null_pipelines:int} $report
     */
    private function renderReport(Company $company, array $report, string $heading): void
    {
        $this->newLine();
        $this->info("{$heading}: {$company->name} (#{$company->id})");
        $this->table(
            ['Active', 'Soft deleted', 'Invalid status', 'Invalid pipeline', 'Null pipeline'],
            [[
                $report['active'],
                $report['soft_deleted'],
                $report['invalid_statuses'],
                $report['invalid_pipelines'],
                $report['null_pipelines'],
            ]],
        );
    }
}
