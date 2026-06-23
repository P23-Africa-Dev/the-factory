<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CompanyLocationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'company_id' => $this->company_id,
            'created_by_user_id' => $this->created_by_user_id,
            'updated_by_user_id' => $this->updated_by_user_id,
            'crm_lead_id' => $this->crm_lead_id,
            'linked_to_crm' => $this->crm_lead_id !== null,
            'name' => $this->name,
            'type' => $this->type,
            'description' => $this->description,
            'address' => $this->address,
            'latitude' => $this->latitude !== null ? (float) $this->latitude : null,
            'longitude' => $this->longitude !== null ? (float) $this->longitude : null,
            'contact_number' => $this->contact_number,
            'email' => $this->email,
            'is_active' => (bool) $this->is_active,
            'meta' => $this->meta,
            'created_by' => $this->whenLoaded('creator', fn(): ?array => $this->creator ? [
                'id' => $this->creator->id,
                'name' => $this->creator->name,
                'email' => $this->creator->email,
            ] : null),
            'updated_by' => $this->whenLoaded('updater', fn(): ?array => $this->updater ? [
                'id' => $this->updater->id,
                'name' => $this->updater->name,
                'email' => $this->updater->email,
            ] : null),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
