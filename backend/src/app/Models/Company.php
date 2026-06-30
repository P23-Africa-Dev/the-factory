<?php

namespace App\Models;

use App\Enums\BillingInterval;
use App\Enums\CompanyUserRole;
use App\Enums\SubscriptionStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Laravel\Cashier\Billable;

class Company extends Model
{
    use Billable;
    use HasFactory;

    protected $fillable = [
        'company_id',
        'name',
        'country',
        'currency_code',
        'team_size',
        'use_case',
        'status',
        'activated_at',
        'stripe_id',
        'subscription_plan_key',
        'subscription_billing_interval',
        'subscription_status',
        'subscription_current_period_start',
        'subscription_current_period_end',
        'subscription_grace_ends_at',
        'assigned_plan_key',
        'assigned_billing_interval',
        'payment_link_token_hash',
        'payment_link_expires_at',
    ];

    protected function casts(): array
    {
        return [
            'activated_at' => 'datetime',
            'subscription_current_period_start' => 'datetime',
            'subscription_current_period_end' => 'datetime',
            'subscription_grace_ends_at' => 'datetime',
            'payment_link_expires_at' => 'datetime',
        ];
    }

    public function subscriptionStatusEnum(): SubscriptionStatus
    {
        return SubscriptionStatus::tryFrom((string) $this->subscription_status)
            ?? SubscriptionStatus::NONE;
    }

    public function hasActiveSubscription(): bool
    {
        if (! (bool) config('billing.enforce', true)) {
            return true;
        }

        return $this->subscriptionStatusEnum()->allowsDashboardAccess();
    }

    public function canChoosePlan(): bool
    {
        return $this->assigned_plan_key === null || $this->assigned_plan_key === '';
    }

    public function lockedPlanKey(): ?string
    {
        if ($this->assigned_plan_key !== null && $this->assigned_plan_key !== '') {
            return $this->assigned_plan_key;
        }

        return null;
    }

    public function lockedBillingInterval(): ?BillingInterval
    {
        if ($this->assigned_billing_interval === null || $this->assigned_billing_interval === '') {
            return null;
        }

        return BillingInterval::tryFrom($this->assigned_billing_interval);
    }

    public function owner(): ?User
    {
        return $this->users()
            ->wherePivot('role', CompanyUserRole::OWNER->value)
            ->orderByPivot('joined_at')
            ->first();
    }

    public function stripeEmail(): ?string
    {
        return $this->owner()?->email;
    }

    public function stripeName(): ?string
    {
        return $this->name;
    }

    public function stripeMetadata(): ?array
    {
        return [
            'company_id' => (string) $this->id,
            'public_company_id' => (string) $this->company_id,
        ];
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'company_users')
            ->withPivot(['role', 'joined_at'])
            ->withTimestamps();
    }

    public function demoRequests(): HasMany
    {
        return $this->hasMany(CompanyDemoRequest::class);
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }

    public function projects(): HasMany
    {
        return $this->hasMany(Project::class);
    }

    public function payrollSetting(): HasOne
    {
        return $this->hasOne(PayrollSetting::class);
    }

    public function attendanceSetting(): HasOne
    {
        return $this->hasOne(AttendanceSetting::class);
    }

    public function attendanceRecords(): HasMany
    {
        return $this->hasMany(AttendanceRecord::class);
    }

    public function attendancePayrollSummaries(): HasMany
    {
        return $this->hasMany(AttendancePayrollSummary::class);
    }

    public function calendarConnection(): HasOne
    {
        return $this->hasOne(CompanyCalendarConnection::class);
    }

    public function meetings(): HasMany
    {
        return $this->hasMany(Meeting::class);
    }

    public function reminderLogs(): HasMany
    {
        return $this->hasMany(SubscriptionReminderLog::class);
    }
}
