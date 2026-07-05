<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Support\AvatarUrlResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LeadResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'company_id' => $this->company_id,
            'pipeline_id' => $this->pipeline_id,
            'company_location_id' => $this->company_location_id,
            'linked_to_map' => $this->company_location_id !== null,
            'created_by_user_id' => $this->created_by_user_id,
            'assigned_to_user_id' => $this->assigned_to_user_id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'location' => $this->location,
            'source' => $this->source,
            'status' => $this->status,
            'priority' => $this->priority?->value,
            'budget_amount' => $this->budget_amount !== null ? (float) $this->budget_amount : null,
            'budget_currency' => $this->budget_currency,
            'budget' => $this->budget_amount !== null
                ? trim(($this->budget_currency ?? 'USD') . ' ' . number_format((float) $this->budget_amount, 2, '.', ''))
                : null,
            'next_action' => $this->next_action,
            'last_interaction' => $this->last_interaction,
            'last_interaction_at' => $this->last_interaction_at?->toIso8601String(),
            'meta' => $this->meta,
            'converted_at' => $this->converted_at?->toIso8601String(),
            'creator' => $this->whenLoaded('creator', fn(): ?array => $this->creator ? [
                'id' => $this->creator->id,
                'name' => $this->creator->name,
                'email' => $this->creator->email,
                'avatar_url' => AvatarUrlResolver::resolveOrDefault($this->creator->avatar, $this->creator->gender),
            ] : null),
            'assignee' => $this->whenLoaded('assignee', fn(): ?array => $this->assignee ? [
                'id' => $this->assignee->id,
                'name' => $this->assignee->name,
                'email' => $this->assignee->email,
                'avatar_url' => AvatarUrlResolver::resolveOrDefault($this->assignee->avatar, $this->assignee->gender),
            ] : null),
            'pipeline' => $this->whenLoaded('pipeline', fn(): ?array => $this->pipeline ? [
                'id' => $this->pipeline->id,
                'name' => $this->pipeline->name,
                'currency_code' => $this->pipeline->currency_code,
            ] : null),
            'notes' => LeadNoteResource::collection($this->whenLoaded('notes')),
            'activities' => LeadActivityResource::collection($this->whenLoaded('activities')),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
