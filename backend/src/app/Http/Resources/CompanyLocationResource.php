<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CompanyLocationResource extends JsonResource
{
    private ?int $viewerCompanyId = null;

    private ?string $viewerRole = null;

    public function withViewerContext(int $companyId, string $role): self
    {
        $this->viewerCompanyId = $companyId;
        $this->viewerRole = $role;

        return $this;
    }

    public function toArray(Request $request): array
    {
        $viewerCompanyId = $this->viewerCompanyId ?? $request->attributes->get('viewer_company_id');
        $viewerRole = $this->viewerRole ?? (string) ($request->attributes->get('viewer_role') ?? '');
        $isOwnerOrg = $viewerCompanyId !== null && (int) $this->company_id === (int) $viewerCompanyId;
        $canManage = $isOwnerOrg && in_array($viewerRole, ['owner', 'admin', 'supervisor'], true);

        $publicFields = [
            'id' => $this->id,
            'name' => $this->name,
            'type' => $this->type,
            'description' => $this->description,
            'address' => $this->address,
            'latitude' => $this->latitude !== null ? (float) $this->latitude : null,
            'longitude' => $this->longitude !== null ? (float) $this->longitude : null,
            'contact_number' => $this->contact_number,
            'email' => $this->email,
            'is_active' => (bool) $this->is_active,
            'created_at' => $this->created_at?->toIso8601String(),
            'can_manage' => $canManage,
        ];

        if (! $isOwnerOrg) {
            return $publicFields;
        }

        return array_merge($publicFields, [
            'company_id' => $this->company_id,
            'created_by_user_id' => $this->created_by_user_id,
            'updated_by_user_id' => $this->updated_by_user_id,
            'crm_lead_id' => $this->crm_lead_id,
            'linked_to_crm' => $this->crm_lead_id !== null,
            'meta' => $this->meta,
            'created_by' => $this->whenLoaded('creator', fn (): ?array => $this->creator ? [
                'id' => $this->creator->id,
                'name' => $this->creator->name,
                'email' => $this->creator->email,
            ] : null),
            'updated_by' => $this->whenLoaded('updater', fn (): ?array => $this->updater ? [
                'id' => $this->updater->id,
                'name' => $this->updater->name,
                'email' => $this->updater->email,
            ] : null),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ]);
    }
}
