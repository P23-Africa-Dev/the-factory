<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\CrmEmailDirection;
use App\Enums\CrmEmailStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class CrmEmailMessage extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'company_id',
        'thread_id',
        'lead_id',
        'gmail_message_id',
        'gmail_thread_id',
        'direction',
        'status',
        'from_name',
        'from_email',
        'to_recipients',
        'cc_recipients',
        'bcc_recipients',
        'subject',
        'body_html',
        'body_text',
        'is_read',
        'is_starred',
        'sent_by_user_id',
        'gmail_account_email',
        'error_message',
        'sent_at',
        'received_at',
    ];

    protected function casts(): array
    {
        return [
            'direction' => CrmEmailDirection::class,
            'status' => CrmEmailStatus::class,
            'to_recipients' => 'array',
            'cc_recipients' => 'array',
            'bcc_recipients' => 'array',
            'is_read' => 'boolean',
            'is_starred' => 'boolean',
            'sent_at' => 'datetime',
            'received_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function thread(): BelongsTo
    {
        return $this->belongsTo(CrmEmailThread::class, 'thread_id');
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function sentBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sent_by_user_id');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(CrmEmailAttachment::class, 'message_id');
    }
}
