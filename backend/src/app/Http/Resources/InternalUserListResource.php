<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Services\Workforce\AgentPresenceService;
use App\Support\AvatarUrlResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class InternalUserListResource extends JsonResource
{
    /**
     * Simplified resource for listing internal users (project manager selection, etc).
     * 
     * Returns only essential fields needed for frontend selection/assignment.
     */
    public function toArray(Request $request): array
    {
        $latestInvitation = $this->whenLoaded('latestInternalInvitation');
        $avatarUrl = AvatarUrlResolver::resolveOrDefault($this->avatar, $this->gender);
        $presence = $this->agent_presence ?? app(AgentPresenceService::class)->emptyPresence();

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->internal_role,
            'internal_role' => $this->internal_role,
            'assigned_zone' => $this->assigned_zone,
            'phone_number' => $this->phone_number,
            'base_salary' => $this->base_salary,
            'payroll_salary_type' => $this->payroll_salary_type,
            'salary_currency' => $this->salary_currency,
            'avatar_key' => $this->avatar,
            'avatar_url' => $avatarUrl,
            'onboarding_status' => $this->onboarding_status,
            'is_active' => (bool) $this->is_active,
            'internal_onboarding_completed_at' => $this->internal_onboarding_completed_at?->toIso8601String(),
            'invite_sent_at' => $latestInvitation?->sent_at?->toIso8601String(),
            'invite_expires_at' => $latestInvitation?->expires_at?->toIso8601String(),
            'invite_accepted_at' => $latestInvitation?->accepted_at?->toIso8601String(),
            'invite_revoked_at' => $latestInvitation?->revoked_at?->toIso8601String(),
            'presence' => $presence,
        ];
    }
}
