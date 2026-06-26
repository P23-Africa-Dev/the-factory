<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CrmEmailThread extends Model
{
    use HasFactory;

    protected $fillable = [
        'company_id',
        'lead_id',
        'gmail_thread_id',
        'subject',
        'snippet',
        'last_message_at',
        'unread_count',
        'message_count',
        'participant_emails',
    ];

    protected function casts(): array
    {
        return [
            'participant_emails' => 'array',
            'last_message_at' => 'datetime',
            'unread_count' => 'integer',
            'message_count' => 'integer',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(CrmEmailMessage::class, 'thread_id');
    }
}
