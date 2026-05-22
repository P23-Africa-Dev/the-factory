<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PushSubscriptionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'company_id' => $this->company_id,
            'provider' => $this->provider,
            'platform' => $this->platform,
            'device_token' => $this->device_token,
            'endpoint' => $this->endpoint,
            'is_active' => (bool) $this->is_active,
            'failed_attempts' => (int) $this->failed_attempts,
            'last_failure_reason' => $this->last_failure_reason,
            'last_failed_at' => $this->last_failed_at?->toIso8601String(),
            'last_seen_at' => $this->last_seen_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
