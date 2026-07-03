<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Billing\SubscriptionLifecycleService;
use Illuminate\Console\Command;

class ProcessSubscriptionsCommand extends Command
{
    protected $signature = 'billing:process-subscriptions';

    protected $description = 'Process subscription reminders, grace periods, and suspensions';

    public function handle(SubscriptionLifecycleService $service): int
    {
        $service->process();

        $this->info('Subscription lifecycle processing completed.');

        return self::SUCCESS;
    }
}
