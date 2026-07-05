<?php

declare(strict_types=1);

namespace App\Services\Company;

use App\Enums\CompanyUserRole;
use App\Models\Company;
use App\Models\User;
use Illuminate\Validation\ValidationException;

class CompanySettingsService
{
    /**
     * @return array<string, mixed>
     */
    public function show(User $user, ?int $companyId = null): array
    {
        $company = $this->resolveCompany($user, $companyId, requireManagement: false);
        $role = (string) $company->pivot?->role;

        return $this->payload($company, $role);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function update(User $user, array $data, ?int $companyId = null): array
    {
        $company = $this->resolveCompany($user, $companyId, requireManagement: true);
        $role = (string) $company->pivot?->role;
        $settings = is_array($company->settings) ? $company->settings : [];

        if (isset($data['operational_defaults']) && is_array($data['operational_defaults'])) {
            $settings['operational_defaults'] = array_merge(
                $settings['operational_defaults'] ?? [],
                $this->sanitizeOperationalDefaults($data['operational_defaults']),
            );
        }

        if (isset($data['meeting_defaults']) && is_array($data['meeting_defaults'])) {
            $settings['meeting_defaults'] = array_merge(
                $settings['meeting_defaults'] ?? [],
                $this->sanitizeMeetingDefaults($data['meeting_defaults']),
            );
        }

        $company->forceFill(['settings' => $settings])->save();

        return $this->payload($company->fresh(), $role);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(Company $company, string $role): array
    {
        $settings = is_array($company->settings) ? $company->settings : [];
        $canEdit = in_array($role, [
            CompanyUserRole::OWNER->value,
            CompanyUserRole::ADMIN->value,
            CompanyUserRole::SUPERVISOR->value,
        ], true);

        return [
            'company_id' => $company->id,
            'company_name' => $company->name,
            'country' => $company->country,
            'currency_code' => $company->currency_code,
            'team_size' => $company->team_size,
            'use_case' => $company->use_case,
            'operational_defaults' => $settings['operational_defaults'] ?? [
                'minimum_photos_required' => 1,
                'visit_verification_required' => false,
            ],
            'meeting_defaults' => $settings['meeting_defaults'] ?? [
                'default_reminder_minutes' => 15,
            ],
            'can_edit' => $canEdit,
            'viewer_role' => $role,
        ];
    }

    /**
     * @param  array<string, mixed>  $defaults
     * @return array<string, mixed>
     */
    private function sanitizeOperationalDefaults(array $defaults): array
    {
        $result = [];

        if (array_key_exists('minimum_photos_required', $defaults)) {
            $result['minimum_photos_required'] = max(0, min(20, (int) $defaults['minimum_photos_required']));
        }

        if (array_key_exists('visit_verification_required', $defaults)) {
            $result['visit_verification_required'] = (bool) $defaults['visit_verification_required'];
        }

        return $result;
    }

    /**
     * @param  array<string, mixed>  $defaults
     * @return array<string, mixed>
     */
    private function sanitizeMeetingDefaults(array $defaults): array
    {
        $result = [];

        if (array_key_exists('default_reminder_minutes', $defaults)) {
            $allowed = [5, 10, 15, 30, 60];
            $minutes = (int) $defaults['default_reminder_minutes'];
            $result['default_reminder_minutes'] = in_array($minutes, $allowed, true) ? $minutes : 15;
        }

        return $result;
    }

    private function resolveCompany(User $user, ?int $companyId, bool $requireManagement): Company
    {
        $query = $user->companies()->where('companies.status', 'active');

        if ($companyId !== null) {
            $company = (clone $query)->where('companies.id', $companyId)->first();
        } else {
            $company = $query
                ->orderByPivot('joined_at', 'desc')
                ->orderByPivot('company_users.created_at', 'desc')
                ->first();
        }

        if (! $company) {
            throw ValidationException::withMessages([
                'company_id' => ['You are not attached to any company context.'],
            ]);
        }

        $role = (string) $company->pivot?->role;

        if ($requireManagement && ! in_array($role, [
            CompanyUserRole::OWNER->value,
            CompanyUserRole::ADMIN->value,
            CompanyUserRole::SUPERVISOR->value,
        ], true)) {
            throw ValidationException::withMessages([
                'company_id' => ['You do not have permission to update organization settings.'],
            ]);
        }

        return $company;
    }
}
