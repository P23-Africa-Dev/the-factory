<?php

declare(strict_types=1);

namespace App\Services\Payroll;

use App\Models\PayrollSetting;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PayrollService
{
    public function __construct(private readonly PayrollAccessService $accessService) {}

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

        return DB::transaction(function () use ($context, $data, $currency, $workDays, $baseSalary): PayrollSetting {
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
}
