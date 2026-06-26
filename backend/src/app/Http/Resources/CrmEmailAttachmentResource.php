<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CrmEmailAttachmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'filename' => $this->filename,
            'mime_type' => $this->mime_type,
            'size_bytes' => $this->size_bytes,
            'sync_status' => $this->sync_status,
            'download_url' => $this->when(
                $this->storage_path !== null,
                fn (): string => url('/api/v1/crm/emails/attachments/' . $this->id),
            ),
        ];
    }
}
