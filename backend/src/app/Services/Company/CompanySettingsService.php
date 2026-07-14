<?php

declare(strict_types=1);

namespace App\Services\Company;

use App\Enums\CompanyUserRole;
use App\Models\Company;
use App\Models\User;
use App\Services\Internal\InternalUserAuditLogger;
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

        if (isset($data['user_management']) && is_array($data['user_management'])) {
            if (! in_array($role, [CompanyUserRole::OWNER->value, CompanyUserRole::ADMIN->value], true)) {
                throw ValidationException::withMessages([
                    'authorization' => ['Only owners and admins can update user management settings.'],
                ]);
            }

            $previous = $settings['user_management'] ?? [];
            $settings['user_management'] = array_merge(
                $previous,
                $this->sanitizeUserManagementSettings($data['user_management']),
            );

            if ($settings['user_management'] !== $previous) {
                app(InternalUserAuditLogger::class)->log(
                    companyId: (int) $company->id,
                    actorUserId: (int) $user->id,
                    targetUserId: (int) $user->id,
                    action: 'privilege_updated',
                    metadata: [
                        'user_management' => $settings['user_management'],
                    ],
                );
            }
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
            'user_management' => $settings['user_management'] ?? [
                'supervisor_can_suspend_agents' => false,
                'supervisor_can_delete_agents' => false,
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

    /**
     * @param  array<string, mixed>  $settings
     * @return array<string, bool>
     */
    private function sanitizeUserManagementSettings(array $settings): array
    {
        $result = [];

        if (array_key_exists('supervisor_can_suspend_agents', $settings)) {
            $result['supervisor_can_suspend_agents'] = (bool) $settings['supervisor_can_suspend_agents'];
        }

        if (array_key_exists('supervisor_can_delete_agents', $settings)) {
            $result['supervisor_can_delete_agents'] = (bool) $settings['supervisor_can_delete_agents'];
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
