<?php

declare(strict_types=1);

namespace App\Services\AI\Policy;

class ActionConfirmationPolicyService
{
    private const CONFIRMED_ACTIONS = [
        'tasks.create',
        'tasks.reassign',
        'meetings.schedule',
        'notifications.send',
        'projects.create',
    ];

    public function requiresConfirmation(string $tool): bool
    {
        return in_array($tool, self::CONFIRMED_ACTIONS, true);
    }
}
