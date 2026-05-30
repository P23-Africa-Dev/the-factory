<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Meeting extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'company_id',
        'created_by_user_id',
        'project_id',
        'task_id',
        'title',
        'description',
        'location',
        'timezone',
        'start_at',
        'end_at',
        'status',
        'source_page',
        'reminder_config',
        'meeting_settings',
        'google_event_id',
        'google_calendar_id',
        'google_meet_url',
        'google_html_link',
        'sync_status',
        'sync_error_message',
        'synced_at',
        'external_updated_at',
    ];

    protected function casts(): array
    {
        return [
            'start_at' => 'datetime',
            'end_at' => 'datetime',
            'reminder_config' => 'array',
            'meeting_settings' => 'array',
            'synced_at' => 'datetime',
            'external_updated_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function attendees(): HasMany
    {
        return $this->hasMany(MeetingAttendee::class);
    }

    public function reminders(): HasMany
    {
        return $this->hasMany(MeetingReminder::class);
    }
}
