<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CrmEmailAttachment extends Model
{
    use HasFactory;

    protected $fillable = [
        'company_id',
        'message_id',
        'uploaded_by_user_id',
        'gmail_attachment_id',
        'gmail_message_id',
        'filename',
        'mime_type',
        'size_bytes',
        'storage_disk',
        'storage_path',
        'sync_status',
    ];

    protected function casts(): array
    {
        return [
            'size_bytes' => 'integer',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function message(): BelongsTo
    {
        return $this->belongsTo(CrmEmailMessage::class, 'message_id');
    }

    public function uploadedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by_user_id');
    }
}
