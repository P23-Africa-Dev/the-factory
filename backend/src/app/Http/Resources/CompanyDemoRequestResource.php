<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CompanyDemoRequestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'full_name' => $this->full_name,
            'email' => $this->email,
            'phone' => $this->phone,
            'company_name' => $this->company_name,
            'country' => $this->country,
            'team_size' => $this->team_size,
            'use_case' => $this->use_case,
            'status' => $this->status,
            'requested_at' => $this->requested_at?->toIso8601String(),
            'approved_at' => $this->approved_at?->toIso8601String(),
            'activated_at' => $this->activated_at?->toIso8601String(),
            'company' => $this->whenLoaded('company', function () {
                return [
                    'id' => $this->company?->id,
                    'company_id' => $this->company?->company_id,
                    'name' => $this->company?->name,
                ];
            }),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
