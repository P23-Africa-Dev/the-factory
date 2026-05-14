<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TaskProofResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'uploaded_by_user_id' => $this->uploaded_by_user_id,
            'file_url' => $this->file_url,
            'mime_type' => $this->mime_type,
            'size_bytes' => $this->size_bytes,
            'latitude' => $this->latitude,
            'longitude' => $this->longitude,
            'captured_at' => $this->captured_at?->toIso8601String(),
            'notes' => $this->notes,
            'uploader' => $this->whenLoaded('uploader', fn (): array => [
                'id' => $this->uploader->id,
                'name' => $this->uploader->name,
                'email' => $this->uploader->email,
            ]),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
