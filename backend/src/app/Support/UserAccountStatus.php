<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\User;
use Carbon\CarbonInterface;

final class UserAccountStatus
{
    public const DEACTIVATED = 'deactivated';

    public const SUSPENDED_TEMPORARY = 'suspended_temporary';

    public const SUSPENDED_PERMANENT = 'suspended_permanent';

    public const PERMANENT_SUSPENSION_YEAR = 2090;

    /**
     * @return array{code: string, message: string, suspended_until: ?CarbonInterface}|null
     */
    public static function resolveBlock(User $user): ?array
    {
        if ($user->trashed()) {
            return [
                'code' => self::DEACTIVATED,
                'message' => self::deactivatedMessage(),
                'suspended_until' => null,
            ];
        }

        if (! $user->isActive()) {
            return [
                'code' => self::DEACTIVATED,
                'message' => self::deactivatedMessage(),
                'suspended_until' => null,
            ];
        }

        if ($user->isSuspended()) {
            $isPermanent = self::isPermanentSuspension($user);

            return [
                'code' => $isPermanent ? self::SUSPENDED_PERMANENT : self::SUSPENDED_TEMPORARY,
                'message' => $isPermanent
                    ? self::permanentSuspensionMessage()
                    : self::temporarySuspensionMessage($user->suspended_until),
                'suspended_until' => $isPermanent ? null : $user->suspended_until,
            ];
        }

        return null;
    }

    public static function isPermanentSuspension(User $user): bool
    {
        return $user->suspended_until !== null
            && $user->suspended_until->year >= self::PERMANENT_SUSPENSION_YEAR;
    }

    public static function deactivatedMessage(): string
    {
        return 'Your account has been deactivated and is no longer permitted to access the platform. Please contact Factory23 Support if you believe this action was taken in error.';
    }

    public static function permanentSuspensionMessage(): string
    {
        return 'Your account has been suspended. Access to the platform has been restricted. Please contact Factory23 Support for further information and assistance.';
    }

    public static function temporarySuspensionMessage(CarbonInterface $until): string
    {
        return sprintf(
            'Your account has been temporarily suspended until %s. During this period, you will not be able to access the platform. If you require assistance, please contact Factory23 Support.',
            $until->format('F j, Y'),
        );
    }

    /**
     * Clear expired suspensions so access is restored without waiting for the scheduler.
     */
    public static function liftExpiredSuspensionIfNeeded(User $user): void
    {
        if ($user->suspended_until !== null && $user->suspended_until->isPast()) {
            $user->forceFill(['suspended_until' => null])->save();
            $user->refresh();
        }
    }
}
