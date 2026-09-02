<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class InternalUserAuditLogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'action' => $this->action,
            'metadata' => $this->metadata,
            'created_at' => $this->created_at?->toIso8601String(),
            'actor' => [
                'id' => $this->actor?->id,
                'name' => $this->actor?->name,
                'email' => $this->actor?->email,
            ],
            'target' => [
                'id' => $this->target?->id,
                'name' => $this->target?->name,
                'email' => $this->target?->email,
                'internal_role' => $this->target?->internal_role,
            ],
        ];
    }
}
