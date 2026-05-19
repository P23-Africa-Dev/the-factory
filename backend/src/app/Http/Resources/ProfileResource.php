<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\User;
use App\Support\AvatarUrlResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProfileResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var array<string, mixed> $payload */
        $payload = is_array($this->resource) ? $this->resource : [];

        /** @var User $user */
        $user = $payload['user'];
        $company = $payload['company'] ?? null;
        $membershipRole = (string) ($payload['membership_role'] ?? '');
        $membershipJoinedAt = $payload['membership_joined_at'] ?? null;

        $avatarKey = $user->avatar;
        $avatarUrl = AvatarUrlResolver::resolve($avatarKey, $user->gender);

        return [
            'identity' => [
                'id' => $user->id,
                'full_name' => $user->name,
                'email' => $user->email,
                'phone_number' => $user->phone_number,
                'gender' => $user->gender,
                'avatar_key' => $avatarKey,
                'avatar_url' => $avatarUrl,
                'avatar_source' => $this->avatarSource($avatarKey),
            ],
            'organization' => [
                'company' => $company ? [
                    'id' => $company->id,
                    'company_id' => $company->company_id,
                    'name' => $company->name,
                    'status' => $company->status,
                    'team_size' => $company->team_size,
                    'country' => $company->country,
                    'purpose' => $company->use_case,
                ] : null,
                'assigned_company' => $company ? [
                    'id' => $company->id,
                    'company_id' => $company->company_id,
                    'name' => $company->name,
                ] : null,
                'membership' => [
                    'relation' => 'company_users',
                    'role' => $membershipRole,
                    'joined_at' => $membershipJoinedAt ? (string) $membershipJoinedAt : null,
                    'department' => null,
                ],
                'role' => $membershipRole,
                'internal_role' => $user->internal_role,
                'user_type' => $payload['user_type'] ?? null,
            ],
            'account' => [
                'email_verified' => $user->isEmailVerified(),
                'onboarding' => $payload['onboarding'] ?? null,
                'onboarding_status' => $user->onboarding_status,
                'status' => $this->accountStatus($user),
                'is_active' => (bool) $user->is_active,
                'created_at' => $user->created_at?->toIso8601String(),
                'updated_at' => $user->updated_at?->toIso8601String(),
            ],
            'permissions' => $payload['permissions'] ?? [],
        ];
    }

    private function avatarSource(?string $avatarKey): string
    {
        if (! is_string($avatarKey) || trim($avatarKey) === '') {
            return 'none';
        }

        $basePath = trim((string) config('internal_onboarding.avatar_storage_root', 'avatar'), '/');
        $normalizedAvatarKey = trim($avatarKey);

        if (str_starts_with($normalizedAvatarKey, "{$basePath}/custom/")) {
            return 'custom_upload';
        }

        if (str_starts_with($normalizedAvatarKey, "{$basePath}/")) {
            return 'catalog';
        }

        if (str_starts_with($normalizedAvatarKey, '/') || preg_match('/^https?:\/\//i', $normalizedAvatarKey) === 1) {
            return 'external';
        }

        return 'catalog';
    }

    private function accountStatus(User $user): string
    {
        if (! $user->isActive()) {
            return 'deactivated';
        }

        if ($user->isSuspended()) {
            return 'suspended';
        }

        return 'active';
    }
}
