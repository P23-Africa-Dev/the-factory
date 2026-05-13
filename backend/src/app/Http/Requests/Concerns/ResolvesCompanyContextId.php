<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Support\CompanyContextIdResolver;

trait ResolvesCompanyContextId
{
    protected function resolveCompanyContextId(mixed $companyId): mixed
    {
        return CompanyContextIdResolver::resolveForValidation($companyId);
    }
}
