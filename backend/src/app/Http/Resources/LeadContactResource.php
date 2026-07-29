<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LeadContactResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => (int) $this->id,
            'name' => (string) $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'location' => $this->location,
            'sort_order' => (int) $this->sort_order,
        ];
    }
}
