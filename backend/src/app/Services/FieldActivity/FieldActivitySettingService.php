<?php

declare(strict_types=1);

namespace App\Services\FieldActivity;

use App\Models\Company;

class FieldActivitySettingService
{
    public function isEnabledForCompany(Company $company): bool
    {
        return (bool) ($company->field_activity_enabled ?? false);
    }

    public function setEnabled(Company $company, bool $enabled): void
    {
        $company->forceFill(['field_activity_enabled' => $enabled])->save();
    }
}
