<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class WorkspaceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->ulid,
            'name' => $this->name,
            'slug' => $this->slug,
            'country' => $this->country,
            'team_size' => $this->team_size,
            'purpose' => $this->purpose,
            'user_type' => $this->user_type,
            'created_at' => $this->created_at->toIso8601String(),
        ];
    }
}
