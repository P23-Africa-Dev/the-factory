<?php

declare(strict_types=1);

namespace App\Services\Company;

use App\Models\Company;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CompanyContextService
{
    /**
     * Resolve the active company context for the authenticated user.
     *
     * If companyId is provided, the user must belong to that active company.
     * If not provided, the most recent active membership is selected.
     *
     * @return array{company: Company, role: string}
     */
    public function resolve(User $user, ?int $companyId = null): array
    {
        $supportCompanyId = request()?->attributes->get('support_company_id');
        if (is_numeric($supportCompanyId)) {
            $supportCompanyId = (int) $supportCompanyId;
            $companyId = $supportCompanyId;
        }

        $baseQuery = DB::table('company_users')
            ->join('companies', 'companies.id', '=', 'company_users.company_id')
            ->where('company_users.user_id', $user->id)
            ->where('companies.status', 'active')
            ->select([
                'company_users.company_id',
                'company_users.role',
                'company_users.joined_at',
                'company_users.created_at',
            ]);

        if ($companyId !== null) {
            $membership = (clone $baseQuery)
                ->where('company_users.company_id', $companyId)
                ->first();

            if (! $membership) {
                $hasAnyActiveMembership = (clone $baseQuery)->exists();

                throw ValidationException::withMessages([
                    'company_id' => [$hasAnyActiveMembership
                        ? 'You are not attached to the selected company context.'
                        : 'You are not attached to any company context.'],
                ]);
            }
        } else {
            $membership = (clone $baseQuery)
                ->orderByDesc('company_users.joined_at')
                ->orderByDesc('company_users.created_at')
                ->first();

            if (! $membership) {
                throw ValidationException::withMessages([
                    'company_id' => ['You are not attached to any company context.'],
                ]);
            }
        }

        $company = Company::query()->find((int) $membership->company_id);

        if (! $company || $company->status !== 'active') {
            throw ValidationException::withMessages([
                'company_id' => ['Company context is invalid.'],
            ]);
        }

        return [
            'company' => $company,
            'role' => is_numeric($supportCompanyId)
                ? (string) (request()?->attributes->get('support_effective_role') ?? 'owner')
                : (string) $membership->role,
        ];
    }
}
