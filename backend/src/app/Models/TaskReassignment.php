<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\TaskReassignmentStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TaskReassignment extends Model
{
    use HasFactory;

    protected $fillable = [
        'task_id',
        'company_id',
        'requested_by_user_id',
        'from_user_id',
        'to_user_id',
        'status',
        'reason',
        'response_note',
        'responded_by_user_id',
        'requested_at',
        'responded_at',
        'accepted_at',
        'rejected_at',
        'cancelled_at',
        'tracking_transferred_at',
        'action_token',
        'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'status' => TaskReassignmentStatus::class,
            'requested_at' => 'datetime',
            'responded_at' => 'datetime',
            'accepted_at' => 'datetime',
            'rejected_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'tracking_transferred_at' => 'datetime',
            'expires_at' => 'datetime',
        ];
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }

    public function fromUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'from_user_id');
    }

    public function toUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'to_user_id');
    }

    public function respondedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'responded_by_user_id');
    }
}
