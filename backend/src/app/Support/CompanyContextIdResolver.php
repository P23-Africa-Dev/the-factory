<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Company;
use Illuminate\Validation\ValidationException;

final class CompanyContextIdResolver
{
    public static function resolveForValidation(mixed $companyId): mixed
    {
        if ($companyId === null) {
            return null;
        }

        if (is_int($companyId)) {
            return $companyId;
        }

        if (! is_string($companyId)) {
            return $companyId;
        }

        $trimmedCompanyId = trim($companyId);

        if ($trimmedCompanyId === '') {
            return null;
        }

        if (ctype_digit($trimmedCompanyId)) {
            return (int) $trimmedCompanyId;
        }

        $resolvedCompanyId = Company::query()
            ->whereRaw('UPPER(company_id) = ?', [strtoupper($trimmedCompanyId)])
            ->value('id');

        // Unknown public company keys should fail exists rules in request validation.
        return $resolvedCompanyId !== null ? (int) $resolvedCompanyId : -1;
    }

    public static function resolveForController(mixed $companyId): ?int
    {
        if ($companyId === null) {
            return null;
        }

        if (is_string($companyId) && trim($companyId) === '') {
            return null;
        }

        $resolvedCompanyId = self::resolveForValidation($companyId);

        if (is_int($resolvedCompanyId) && $resolvedCompanyId > 0) {
            return $resolvedCompanyId;
        }

        throw ValidationException::withMessages([
            'company_id' => ['The selected company context is invalid.'],
        ]);
    }
}
