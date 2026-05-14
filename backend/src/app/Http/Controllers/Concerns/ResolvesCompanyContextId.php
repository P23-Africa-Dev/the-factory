<?php

declare(strict_types=1);

namespace App\Http\Controllers\Concerns;

use App\Support\CompanyContextIdResolver;

trait ResolvesCompanyContextId
{
    protected function resolveCompanyContextId(mixed $companyId): ?int
    {
        return CompanyContextIdResolver::resolveForController($companyId);
    }
}
