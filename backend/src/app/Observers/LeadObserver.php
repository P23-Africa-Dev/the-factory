<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\Lead;
use App\Models\LeadLabel;
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

    public function saved(Lead $lead): void
    {
        $this->cacheService->bumpCompanyVersion((int) $lead->company_id);
    }

    public function deleted(Lead $lead): void
    {
        $this->cacheService->bumpCompanyVersion((int) $lead->company_id);
    }
}
