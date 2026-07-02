<?php

declare(strict_types=1);

namespace App\Listeners;

use App\Services\Billing\BillingWebhookService;
use Laravel\Cashier\Events\WebhookReceived;

class HandleStripeWebhook
{
    public function __construct(private readonly BillingWebhookService $service) {}

    public function handle(WebhookReceived $event): void
    {
        $this->service->handle($event);
    }
}
