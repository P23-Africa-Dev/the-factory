<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\Lead;
use App\Models\LeadLabel;
use App\Models\LeadPipeline;
use App\Services\Analytics\AggregateCacheService;

class LeadObserver
{
    public function __construct(private readonly AggregateCacheService $cacheService) {}

    /**
     * A lead counts as converted while it sits in a stage flagged "won".
     * Entering a won stage stamps converted_at; leaving it clears the stamp.
     */
    public function saving(Lead $lead): void
    {
        $this->normalizePipelineAndStatus($lead);

        if ($lead->exists && ! $lead->isDirty('status')) {
            return;
        }

        $status = (string) ($lead->status ?? '');
        $isWon = $status !== '' && LeadLabel::query()
            ->where('company_id', (int) $lead->company_id)
            ->where('slug', $status)
            ->where('is_won', true)
            ->exists();

        if ($isWon) {
            if ($lead->converted_at === null) {
                $lead->converted_at = now();
            }

            return;
        }

        if ($lead->exists) {
            $lead->converted_at = null;
        }
    }

    /**
     * Every lead must sit in a pipeline and a real stage. This used to be done
     * by bulk UPDATEs on every CRM read (LeadService::ensureDefaultCrmSetup),
     * which also rewrote leads in a user-created "new" stage back to the
     * default stage. Normalising on write keeps reads write-free.
     */
    private function normalizePipelineAndStatus(Lead $lead): void
    {
        $companyId = (int) $lead->company_id;
        if ($companyId <= 0) {
            return;
        }

        if ($lead->pipeline_id === null) {
            $lead->pipeline_id = LeadPipeline::query()
                ->where('company_id', $companyId)
                ->orderByDesc('is_default')
                ->orderBy('sort_order')
                ->orderBy('id')
                ->value('id');
        }

        if ($lead->exists && ! $lead->isDirty('status')) {
            return;
        }

        $status = trim((string) ($lead->status ?? ''));
        $needsDefault = $status === ''
            // Legacy "new" status: only remap when the company has no stage with that slug.
            || ($status === 'new' && ! LeadLabel::query()->where('company_id', $companyId)->where('slug', 'new')->exists());

        if ($needsDefault) {
            $default = LeadLabel::query()
                ->where('company_id', $companyId)
                ->orderByDesc('is_default')
                ->orderBy('sort_order')
                ->orderBy('id')
                ->value('slug');

            if ($default !== null) {
                $lead->status = $default;
            }
        }
    }

    public function saved(Lead $lead): void
    {
        $this->cacheService->bumpCompanyVersion((int) $lead->company_id);
    }

    public function deleted(Lead $lead): void
    {
        $this->cacheService->bumpCompanyVersion((int) $lead->company_id);
    }
}
