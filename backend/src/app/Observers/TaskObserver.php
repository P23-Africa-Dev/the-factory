<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\Task;
use App\Services\Analytics\AggregateCacheService;

class TaskObserver
{
    public function __construct(private readonly AggregateCacheService $cacheService) {}

    public function saved(Task $task): void
    {
        $this->cacheService->bumpCompanyVersion((int) $task->company_id);
    }

    public function deleted(Task $task): void
    {
        $this->cacheService->bumpCompanyVersion((int) $task->company_id);
    }
}
