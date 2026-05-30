<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MeetingReminder extends Model
{
    use HasFactory;

    protected $fillable = [
        'meeting_id',
        'recipient_user_id',
        'recipient_email',
        'recipient_name',
        'offset_minutes',
        'custom_remind_at',
        'remind_at',
        'status',
        'attempts',
        'last_attempt_at',
        'next_retry_at',
        'queued_at',
        'sent_at',
        'last_error',
        'dedupe_key',
    ];

    protected function casts(): array
    {
        return [
            'custom_remind_at' => 'datetime',
            'remind_at' => 'datetime',
            'last_attempt_at' => 'datetime',
            'next_retry_at' => 'datetime',
            'queued_at' => 'datetime',
            'sent_at' => 'datetime',
        ];
    }

    public function meeting(): BelongsTo
    {
        return $this->belongsTo(Meeting::class);
    }

    public function recipient(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recipient_user_id');
    }
}
