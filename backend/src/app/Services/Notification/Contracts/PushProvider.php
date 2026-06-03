<?php

declare(strict_types=1);

namespace App\Services\Notification\Contracts;

use App\Models\AppNotification;
use App\Models\PushSubscription;

interface PushProvider
{
    /**
     * @return array{success: bool, error: string|null}
     */
    public function send(PushSubscription $subscription, AppNotification $notification): array;
}
