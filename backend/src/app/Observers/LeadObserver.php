<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\Lead;
use App\Services\Analytics\AggregateCacheService;

class LeadObserver
{
    public function __construct(private readonly AggregateCacheService $cacheService) {}

    public function saved(Lead $lead): void
    {
        $this->cacheService->bumpCompanyVersion((int) $lead->company_id);
    }

    public function deleted(Lead $lead): void
    {
        $this->cacheService->bumpCompanyVersion((int) $lead->company_id);
    }
}
