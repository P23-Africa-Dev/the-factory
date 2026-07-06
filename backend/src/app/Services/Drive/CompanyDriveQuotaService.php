<?php

declare(strict_types=1);

namespace App\Services\Drive;

use App\Models\Company;
use App\Models\DriveFile;
use Illuminate\Validation\ValidationException;

class CompanyDriveQuotaService
{
    public function usedBytes(int $companyId): int
    {
        return (int) DriveFile::query()
            ->where('company_id', $companyId)
            ->sum('size_bytes');
    }

    public function limitBytes(Company $company): int
    {
        $planKey = (string) ($company->subscription_plan_key ?? '');
        $planQuotas = config('drive.plan_quotas_gb', []);

        if ($planKey !== '' && is_array($planQuotas) && isset($planQuotas[$planKey])) {
            return (int) ((float) $planQuotas[$planKey] * 1024 * 1024 * 1024);
        }

        $defaultGb = (float) config('drive.default_quota_gb', 5);

        return (int) ($defaultGb * 1024 * 1024 * 1024);
    }

    /**
     * @return array{used_bytes: int, limit_bytes: int, remaining_bytes: int, percent: float}
     */
    public function usage(Company $company): array
    {
        $used = $this->usedBytes((int) $company->id);
        $limit = $this->limitBytes($company);
        $remaining = max(0, $limit - $used);
        $percent = $limit > 0 ? round(($used / $limit) * 100, 2) : 0.0;

        return [
            'used_bytes' => $used,
            'limit_bytes' => $limit,
            'remaining_bytes' => $remaining,
            'percent' => $percent,
        ];
    }

    public function assertCanStore(Company $company, int $additionalBytes): void
    {
        if ($additionalBytes <= 0) {
            return;
        }

        $usage = $this->usage($company);

        if ($usage['used_bytes'] + $additionalBytes > $usage['limit_bytes']) {
            throw ValidationException::withMessages([
                'file' => ['Company drive storage limit reached. Remove files or upgrade your plan to upload more.'],
            ]);
        }
    }
}
