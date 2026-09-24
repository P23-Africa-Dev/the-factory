<?php

namespace App\Models;

use App\Enums\SalesEngineAccessRequestStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SalesEngineAccessRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'company_id',
        'email',
        'name',
        'company_name',
        'status',
        'reviewed_by_admin_id',
        'requested_at',
        'reviewed_at',
        'admin_notes',
    ];

    protected function casts(): array
    {
        return [
            'requested_at' => 'datetime',
            'reviewed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function reviewedByAdmin(): BelongsTo
    {
        return $this->belongsTo(Admin::class, 'reviewed_by_admin_id');
    }

    public function isPending(): bool
    {
        return $this->status === SalesEngineAccessRequestStatus::PENDING->value;
    }

    public function isApproved(): bool
    {
        return $this->status === SalesEngineAccessRequestStatus::APPROVED->value;
    }

    public function isDeclined(): bool
    {
        return $this->status === SalesEngineAccessRequestStatus::DECLINED->value;
    }
}
