<?php

declare(strict_types=1);

namespace App\Services\Billing;

use App\Enums\SubscriptionStatus;
use App\Models\Company;
use App\Models\SubscriptionReminderLog;
use App\Notifications\SubscriptionExpiryReminderNotification;
use App\Notifications\SubscriptionGraceStartedNotification;
use App\Notifications\SubscriptionSuspendedNotification;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;

class SubscriptionLifecycleService
{
    public function __construct(
        private readonly CompanySubscriptionService $subscriptionService,
        private readonly BillingEnforcementSettingService $billingEnforcement,
    ) {}

    public function process(): void
    {
        if (! $this->billingEnforcement->isEnabled()) {
            Log::info('billing.enforce is disabled — skipping subscription lifecycle processing.');

            return;
        }

        $this->sendExpiryReminders();
        $this->transitionExpiredToGrace();
        $this->sendGraceReminders();
        $this->suspendAfterGrace();
    }

    private function sendExpiryReminders(): void
    {
        $daysList = config('billing.reminder_days_before_expiry', [7, 5, 3, 1]);

        foreach ($daysList as $days) {
            $this->nonDemoCompanies()
                ->where('subscription_status', SubscriptionStatus::ACTIVE->value)
                ->whereNotNull('subscription_current_period_end')
                ->whereDate('subscription_current_period_end', now()->addDays((int) $days)->toDateString())
                ->each(function (Company $company) use ($days): void {
                    if ($this->reminderAlreadySent($company, 'expiry', (int) $days)) {
                        return;
                    }

                    $owner = $company->owner();

                    if (! $owner) {
                        return;
                    }

                    try {
                        $owner->notify(new SubscriptionExpiryReminderNotification(
                            companyName: $company->name,
                            daysRemaining: (int) $days,
                            periodEnd: $company->subscription_current_period_end,
                        ));

                        $this->logReminder($company, 'expiry', (int) $days);
                    } catch (\Throwable $e) {
                        Log::error('Subscription expiry reminder failed.', [
                            'company_id' => $company->id,
                            'days' => $days,
                            'message' => $e->getMessage(),
                        ]);
                    }
                });
        }
    }

    private function transitionExpiredToGrace(): void
    {
        $this->nonDemoCompanies()
            ->where('subscription_status', SubscriptionStatus::ACTIVE->value)
            ->whereNotNull('subscription_current_period_end')
            ->where('subscription_current_period_end', '<=', now())
            ->each(function (Company $company): void {
                $graceEndsAt = now()->addDays((int) config('billing.grace_period_days', 7));

                $company->forceFill([
                    'subscription_status' => SubscriptionStatus::GRACE->value,
                    'subscription_grace_ends_at' => $graceEndsAt,
                ])->save();

                $owner = $company->owner();

                if ($owner) {
                    try {
                        $owner->notify(new SubscriptionGraceStartedNotification(
                            companyName: $company->name,
                            graceEndsAt: $graceEndsAt,
                        ));
                    } catch (\Throwable $e) {
                        Log::error('Grace started notification failed.', [
                            'company_id' => $company->id,
                            'message' => $e->getMessage(),
                        ]);
                    }
                }
            });
    }

    private function sendGraceReminders(): void
    {
        $daysList = config('billing.grace_reminder_days', [5, 3, 1]);

        $this->nonDemoCompanies()
            ->where('subscription_status', SubscriptionStatus::GRACE->value)
            ->whereNotNull('subscription_grace_ends_at')
            ->each(function (Company $company) use ($daysList): void {
                $daysRemaining = (int) now()->diffInDays($company->subscription_grace_ends_at, false);

                if ($daysRemaining < 0 || ! in_array($daysRemaining, $daysList, true)) {
                    return;
                }

                if ($this->reminderAlreadySent($company, 'grace', $daysRemaining)) {
                    return;
                }

                $owner = $company->owner();

                if (! $owner) {
                    return;
                }

                try {
                    $owner->notify(new SubscriptionExpiryReminderNotification(
                        companyName: $company->name,
                        daysRemaining: $daysRemaining,
                        periodEnd: $company->subscription_grace_ends_at,
                        inGracePeriod: true,
                    ));

                    $this->logReminder($company, 'grace', $daysRemaining);
                } catch (\Throwable $e) {
                    Log::error('Grace reminder failed.', [
                        'company_id' => $company->id,
                        'message' => $e->getMessage(),
                    ]);
                }
            });
    }

    private function suspendAfterGrace(): void
    {
        $this->nonDemoCompanies()
            ->whereIn('subscription_status', [
                SubscriptionStatus::GRACE->value,
                SubscriptionStatus::PAST_DUE->value,
            ])
            ->whereNotNull('subscription_grace_ends_at')
            ->where('subscription_grace_ends_at', '<=', now())
            ->each(function (Company $company): void {
                $company->forceFill([
                    'subscription_status' => SubscriptionStatus::SUSPENDED->value,
                ])->save();

                $owner = $company->owner();

                if ($owner) {
                    try {
                        $owner->notify(new SubscriptionSuspendedNotification(
                            companyName: $company->name,
                        ));
                    } catch (\Throwable $e) {
                        Log::error('Subscription suspended notification failed.', [
                            'company_id' => $company->id,
                            'message' => $e->getMessage(),
                        ]);
                    }
                }
            });
    }

    private function reminderAlreadySent(Company $company, string $type, int $daysRemaining): bool
    {
        return SubscriptionReminderLog::query()
            ->where('company_id', $company->id)
            ->where('reminder_type', $type)
            ->where('days_remaining', $daysRemaining)
            ->whereDate('sent_at', now()->toDateString())
            ->exists();
    }

    private function logReminder(Company $company, string $type, int $daysRemaining): void
    {
        SubscriptionReminderLog::query()->create([
            'company_id' => $company->id,
            'reminder_type' => $type,
            'days_remaining' => $daysRemaining,
            'sent_at' => now(),
        ]);
    }

    private function nonDemoCompanies()
    {
        return Company::query()->where('is_demo', false);
    }
}
