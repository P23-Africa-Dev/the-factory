<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CompanyZoneResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => (int) $this->id,
            'company_id' => (int) $this->company_id,
            'name' => (string) $this->name,
            'country_code' => (string) $this->country_code,
            'state_name' => (string) $this->state_name,
            'lga_name' => (string) $this->lga_name,
            'is_active' => (bool) $this->is_active,
            'meta' => is_array($this->meta) ? $this->meta : null,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}

