<?php

declare(strict_types=1);

namespace App\Services\Demo;

use App\Enums\SubscriptionStatus;
use App\Models\Company;
use Illuminate\Support\Carbon;

class DemoCompanyService
{
    public function isDemo(Company|int|null $company): bool
    {
        if ($company === null) {
            return false;
        }

        $model = $company instanceof Company
            ? $company
            : Company::query()->find((int) $company);

        if ($model === null) {
            return false;
        }

        if ((bool) $model->is_demo) {
            return true;
        }

        $publicId = trim((string) $model->company_id);

        return $publicId !== ''
            && in_array($publicId, config('demo.company_public_ids', []), true);
    }

    public function markAsDemo(Company $company): Company
    {
        $company->forceFill([
            'is_demo' => true,
            'subscription_status' => SubscriptionStatus::GRACE->value,
            'subscription_grace_ends_at' => Carbon::parse('2099-12-31 23:59:59'),
        ])->save();

        return $company->fresh();
    }

    public function unmarkDemo(Company $company): Company
    {
        $company->forceFill([
            'is_demo' => false,
            'demo_config' => null,
        ])->save();

        return $company->fresh();
    }
}
