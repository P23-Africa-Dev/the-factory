<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LeadFieldDefinitionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'company_id' => $this->company_id,
            'key' => $this->key,
            'label' => $this->label,
            'description' => $this->description,
            'type' => $this->type?->value ?? $this->type,
            'options' => $this->options ?? [],
            'is_required' => (bool) $this->is_required,
            'show_on_create' => (bool) $this->show_on_create,
            'show_in_list' => (bool) $this->show_in_list,
            'status' => $this->status?->value ?? $this->status,
            'sort_order' => $this->sort_order,
            'created_by_user_id' => $this->created_by_user_id,
            'reviewed_by_user_id' => $this->reviewed_by_user_id,
            'reviewed_at' => $this->reviewed_at?->toIso8601String(),
            'decline_reason' => $this->decline_reason,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
