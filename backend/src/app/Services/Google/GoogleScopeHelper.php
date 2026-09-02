<?php

declare(strict_types=1);

namespace App\Services\Google;

use App\Models\CompanyCalendarConnection;
use App\Models\UserCalendarConnection;

class GoogleScopeHelper
{
    /**
     * Minimum Gmail scopes for CRM email features.
     * gmail.modify already includes read access, so gmail.readonly is not required.
     *
     * @var list<string>
     */
    private const GMAIL_SCOPES = [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
    ];

    /**
     * @return list<string>
     */
    public static function requiredGmailScopes(): array
    {
        return self::GMAIL_SCOPES;
    }

    public static function connectionHasGmailScopes(CompanyCalendarConnection|UserCalendarConnection|null $connection): bool
    {
        if ($connection === null) {
            return false;
        }

        $granted = array_map(
            static fn(mixed $scope): string => trim((string) $scope),
            is_array($connection->scopes) ? $connection->scopes : [],
        );

        foreach (self::GMAIL_SCOPES as $required) {
            if (! in_array($required, $granted, true)) {
                return false;
            }
        }

        return true;
    }
}
