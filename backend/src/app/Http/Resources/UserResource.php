<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $activeCompany = $this->companies()
            ->where('companies.status', 'active')
            ->orderByPivot('joined_at', 'desc')
            ->orderBy('company_users.created_at', 'desc')
            ->first(['companies.id', 'companies.company_id', 'companies.name', 'companies.status']);

        $selfServeCompleted = $this->hasCompletedOnboarding();
        $enterpriseCompleted = $this->hasCompletedEnterpriseOnboarding();
        $internalCompleted = $this->hasCompletedInternalOnboarding();

        $userType = match (true) {
            $selfServeCompleted => 'self-serve',
            $enterpriseCompleted => 'enterprise',
            $internalCompleted => 'internal',
            default => null,
        };

        $avatarUrl = $this->resolveAvatarUrl();

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'avatar' => $avatarUrl ?? $this->avatar,
            'avatar_key' => $this->avatar,
            'email_verified' => $this->isEmailVerified(),
            'onboarding_completed' => $selfServeCompleted || $enterpriseCompleted || $internalCompleted,
            'onboarding_completed_at' => $this->onboarding_completed_at?->toIso8601String(),
            'enterprise_onboarding_completed' => $enterpriseCompleted,
            'enterprise_onboarding_completed_at' => $this->enterprise_onboarding_completed_at?->toIso8601String(),
            'user_type' => $userType,
            'active_company' => $activeCompany ? [
                'id' => $activeCompany->id,
                'company_id' => $activeCompany->company_id,
                'name' => $activeCompany->name,
                'status' => $activeCompany->status,
                'role' => $activeCompany->pivot?->role,
            ] : null,
            'created_at' => $this->created_at->toIso8601String(),
        ];
    }

    private function resolveAvatarUrl(): ?string
    {
        if (! $this->avatar) {
            return null;
        }

        if (str_starts_with($this->avatar, '/') || preg_match('/^https?:\/\//i', $this->avatar) === 1) {
            return $this->avatar;
        }

        $publicBaseUrl = rtrim((string) (
            config('internal_onboarding.avatar_public_base_url')
            ?: config('filesystems.disks.public.url')
            ?: asset('storage')
        ), '/');

        $avatarRoot = trim((string) config('internal_onboarding.avatar_storage_root', 'avatar'), '/');

        if (str_starts_with($this->avatar, "{$avatarRoot}/custom/")) {
            return $publicBaseUrl . '/' . ltrim($this->avatar, '/');
        }

        if (! $this->gender) {
            return null;
        }

        $gender = strtolower((string) $this->gender);

        foreach (['png', 'svg'] as $extension) {
            $candidatePath = "{$avatarRoot}/{$gender}/{$this->avatar}.{$extension}";

            if (Storage::disk('public')->exists($candidatePath)) {
                return $publicBaseUrl . '/' . ltrim($candidatePath, '/');
            }
        }

        return null;
    }
}
