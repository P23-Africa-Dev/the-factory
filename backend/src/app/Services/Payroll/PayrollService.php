<?php

declare(strict_types=1);

namespace App\Services\Payroll;

use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Models\PayrollSetting;
use App\Models\User;
use App\Services\Notification\NotificationService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PayrollService
{
    public function __construct(
        private readonly PayrollAccessService $accessService,
        private readonly NotificationService $notificationService,
    ) {}

    public function findForUser(User $user, ?int $companyId = null): ?PayrollSetting
    {
        $context = $this->accessService->resolve($user, $companyId);
        $this->accessService->ensureCanView($context);

        return PayrollSetting::query()
            ->where('company_id', $context->company->id)
            ->first();
    }

    public function create(User $user, array $data): PayrollSetting
    {
        $context = $this->accessService->resolve($user, $data['company_id'] ?? null);
        $this->accessService->ensureCanManage($context);

        $existing = PayrollSetting::query()
            ->where('company_id', $context->company->id)
            ->first();

        if ($existing) {
            throw ValidationException::withMessages([
                'payroll' => ['Payroll settings already exist for this company.'],
            ]);
        }

        $currency = $this->resolveCurrency(
            preferredCurrency: $data['currency'] ?? null,
            companyCurrency: $context->company->currency_code,
            fallbackCurrency: null,
        );

        $workDays = (int) $data['work_days'];
        $baseSalary = (float) $data['base_salary'];

        $setting = DB::transaction(function () use ($context, $data, $currency, $workDays, $baseSalary): PayrollSetting {
            return PayrollSetting::query()->create([
                'company_id' => $context->company->id,
                'salary_type' => $data['salary_type'],
                'base_salary' => $baseSalary,
                'currency' => $currency,
                'work_days' => $workDays,
                'work_hours' => (int) $data['work_hours'],
                'daily_pay' => $this->calculateDailyPay($baseSalary, $workDays),
                'attendance_affects_pay' => (bool) ($data['attendance_affects_pay'] ?? false),
                'commission_enabled' => (bool) ($data['commission_enabled'] ?? false),
            ]);
        });

        $this->notifyPayrollChange(
            companyId: (int) $context->company->id,
            actor: $user,
            type: 'payroll.settings_created',
            title: 'Payroll settings created',
            message: 'Payroll settings have been configured for your company.',
            priority: NotificationPriority::HIGH->value,
        );

        return $setting;
    }

    public function update(User $user, PayrollSetting $payrollSetting, array $data): PayrollSetting
    {
        $context = $this->accessService->resolve($user, $data['company_id'] ?? null);
        $this->accessService->ensureCanManage($context);
        $this->assertSettingInCompany($payrollSetting, $context->company->id);

        $workDays = (int) ($data['work_days'] ?? $payrollSetting->work_days);
        $baseSalary = (float) ($data['base_salary'] ?? $payrollSetting->base_salary);

        $currency = $this->resolveCurrency(
            preferredCurrency: $data['currency'] ?? null,
            companyCurrency: $context->company->currency_code,
            fallbackCurrency: $payrollSetting->currency,
        );

        $payrollSetting->update([
            'salary_type' => $data['salary_type'] ?? $payrollSetting->salary_type?->value,
            'base_salary' => $baseSalary,
            'currency' => $currency,
            'work_days' => $workDays,
            'work_hours' => (int) ($data['work_hours'] ?? $payrollSetting->work_hours),
            'daily_pay' => $this->calculateDailyPay($baseSalary, $workDays),
            'attendance_affects_pay' => (bool) ($data['attendance_affects_pay'] ?? $payrollSetting->attendance_affects_pay),
            'commission_enabled' => (bool) ($data['commission_enabled'] ?? $payrollSetting->commission_enabled),
        ]);

        $this->notifyPayrollChange(
            companyId: (int) $context->company->id,
            actor: $user,
            type: 'payroll.settings_updated',
            title: 'Payroll settings updated',
            message: 'Payroll settings have been updated.',
            priority: NotificationPriority::NORMAL->value,
        );

        return $payrollSetting->fresh();
    }

    private function resolveCurrency(?string $preferredCurrency, ?string $companyCurrency, ?string $fallbackCurrency): string
    {
        $currency = $preferredCurrency ?: $companyCurrency ?: $fallbackCurrency;

        if (! $currency) {
            throw ValidationException::withMessages([
                'currency' => ['Currency is required either in request payload or company settings.'],
            ]);
        }

        return strtoupper((string) $currency);
    }

    private function calculateDailyPay(float $baseSalary, int $workDays): float
    {
        return round($baseSalary / $workDays, 2);
    }

    private function assertSettingInCompany(PayrollSetting $payrollSetting, int $companyId): void
    {
        if ((int) $payrollSetting->company_id !== $companyId) {
            throw ValidationException::withMessages([
                'payroll' => ['Payroll settings do not belong to the active company context.'],
            ]);
        }
    }

    private function notifyPayrollChange(
        int $companyId,
        User $actor,
        string $type,
        string $title,
        string $message,
        string $priority,
    ): void {
        $recipientIds = DB::table('company_users')
            ->where('company_id', $companyId)
            ->whereIn('role', ['owner', 'admin', 'supervisor'])
            ->pluck('user_id')
            ->map(static fn(mixed $id): int => (int) $id)
            ->unique()
            ->reject(static fn(int $id): bool => $id === (int) $actor->id)
            ->values()
            ->all();

        foreach ($recipientIds as $recipientId) {
            $this->notificationService->notifyUser($recipientId, [
                'company_id' => $companyId,
                'type' => $type,
                'category' => NotificationCategory::PAYROLL->value,
                'title' => $title,
                'message' => $message,
                'reference_type' => PayrollSetting::class,
                'reference_id' => null,
                'action_url' => '/payroll',
                'action_route' => 'payroll.index',
                'priority' => $priority,
                'created_by_user_id' => (int) $actor->id,
                'metadata' => [
                    'company_id' => $companyId,
                    'actor_user_id' => (int) $actor->id,
                ],
                'dedupe_key' => $type . ':' . $companyId . ':' . $recipientId,
            ]);
        }
    }
}
