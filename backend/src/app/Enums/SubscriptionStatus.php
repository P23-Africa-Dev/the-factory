<?php

declare(strict_types=1);

namespace App\Enums;

enum SubscriptionStatus: string
{
    case NONE = 'none';
    case PENDING_PAYMENT = 'pending_payment';
    case ACTIVE = 'active';
    case PAST_DUE = 'past_due';
    case GRACE = 'grace';
    case SUSPENDED = 'suspended';

    public function allowsDashboardAccess(): bool
    {
        return in_array($this, [self::ACTIVE, self::GRACE, self::PAST_DUE], true);
    }

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
