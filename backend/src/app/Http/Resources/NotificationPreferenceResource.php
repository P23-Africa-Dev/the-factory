<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class NotificationPreferenceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'company_id' => $this->company_id,
            'category' => $this->category,
            'is_enabled' => (bool) $this->is_enabled,
            'in_app_enabled' => (bool) $this->in_app_enabled,
            'push_enabled' => (bool) $this->push_enabled,
            'email_enabled' => (bool) $this->email_enabled,
            'muted_until' => $this->muted_until?->toIso8601String(),
            'quiet_hours' => $this->quiet_hours,
            'digest_mode' => $this->digest_mode,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
