<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A photo or document attached to a field stop (private disk, streamed after an access check). */
class FieldStopAttachment extends Model
{
    protected $fillable = [
        'field_stop_id',
        'company_id',
        'user_id',
        'client_attachment_id',
        'disk',
        'file_path',
        'mime_type',
        'size_bytes',
        'original_name',
        'caption',
        'captured_at',
        'latitude',
        'longitude',
    ];

    protected $hidden = ['disk', 'file_path'];

    protected function casts(): array
    {
        return [
            'size_bytes' => 'integer',
            'captured_at' => 'datetime',
            'latitude' => 'float',
            'longitude' => 'float',
        ];
    }

    public function stop(): BelongsTo
    {
        return $this->belongsTo(FieldStop::class, 'field_stop_id');
    }

    public function isImage(): bool
    {
        return str_starts_with((string) $this->mime_type, 'image/');
    }
}
