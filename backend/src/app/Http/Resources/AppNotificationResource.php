<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AppNotificationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'company_id' => $this->company_id,
            'type' => $this->type,
            'category' => $this->category,
            'title' => $this->title,
            'message' => $this->message,
            'reference_type' => $this->reference_type,
            'reference_id' => $this->reference_id,
            'action_url' => $this->action_url,
            'action_route' => $this->action_route,
            'metadata' => $this->metadata,
            'priority' => $this->priority?->value,
            'delivery_types' => $this->delivery_types ?? [],
            'is_in_app_visible' => (bool) $this->is_in_app_visible,
            'is_read' => (bool) $this->is_read,
            'read_at' => $this->read_at?->toIso8601String(),
            'created_by_user_id' => $this->created_by_user_id,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
