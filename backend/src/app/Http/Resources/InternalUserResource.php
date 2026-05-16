<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Support\AvatarUrlResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class InternalUserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $avatarUrl = $this->resolveAvatarUrl();

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'internal_role' => $this->internal_role,
            'onboarding_status' => $this->onboarding_status,
            'assigned_zone' => $this->assigned_zone,
            'work_days' => $this->work_days ?? [],
            'base_salary' => $this->base_salary,
            'salary_currency' => $this->salary_currency,
            'commission_enabled' => (bool) $this->commission_enabled,
            'supervisor_user_id' => $this->supervisor_user_id,
            'phone_number' => $this->phone_number,
            'gender' => $this->gender,
            'avatar_key' => $this->avatar,
            'avatar_url' => $avatarUrl,
            'avatar_svg' => $this->avatar && $this->gender
                ? config("internal_onboarding.avatar_catalog.{$this->gender}.{$this->avatar}")
                : null,
            'internal_onboarding_completed_at' => $this->internal_onboarding_completed_at?->toIso8601String(),
            'is_active' => (bool) $this->is_active,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }

    private function resolveAvatarUrl(): ?string
    {
        return AvatarUrlResolver::resolve($this->avatar, $this->gender);
    }
}
