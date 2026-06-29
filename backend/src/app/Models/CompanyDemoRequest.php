<?php

namespace App\Models;

use App\Enums\DemoRequestStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CompanyDemoRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'full_name',
        'email',
        'phone',
        'company_name',
        'country',
        'team_size',
        'use_case',
        'registration_purpose',
        'registration_user_type',
        'status',
        'reviewed_by_admin_id',
        'company_id',
        'user_id',
        'activation_token_hash',
        'activation_link_expires_at',
        'last_activation_sent_at',
        'requested_at',
        'reviewed_at',
        'approved_at',
        'activated_at',
        'admin_notes',
        'assigned_plan_key',
        'assigned_billing_interval',
    ];

    protected function casts(): array
    {
        return [
            'activation_link_expires_at' => 'datetime',
            'last_activation_sent_at' => 'datetime',
            'requested_at' => 'datetime',
            'reviewed_at' => 'datetime',
            'approved_at' => 'datetime',
            'activated_at' => 'datetime',
        ];
    }

    public function reviewedByAdmin(): BelongsTo
    {
        return $this->belongsTo(Admin::class, 'reviewed_by_admin_id');
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isPending(): bool
    {
        return $this->status === DemoRequestStatus::PENDING->value;
    }

    public function isApproved(): bool
    {
        return $this->status === DemoRequestStatus::APPROVED->value;
    }

    public function isActivated(): bool
    {
        return $this->status === DemoRequestStatus::ACTIVATED->value;
    }
}
