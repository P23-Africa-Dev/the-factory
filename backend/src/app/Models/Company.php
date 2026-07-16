<?php

namespace App\Models;

use App\Enums\BillingInterval;
use App\Enums\CompanyUserRole;
use App\Enums\SubscriptionStatus;
use App\Services\Billing\BillingEnforcementSettingService;
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
        'is_demo',
        'demo_config',
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
        'pm_type',
        'pm_last_four',
        'pm_exp_month',
        'pm_exp_year',
        'settings',
        'map_poi_display_enabled',
    ];

    protected function casts(): array
    {
        return [
            'is_demo' => 'boolean',
            'demo_config' => 'array',
            'settings' => 'array',
            'map_poi_display_enabled' => 'boolean',
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

    /**
     * Raw paid-subscription state, independent of the Billing Enforcement toggle.
     *
     * Returns true only when the company currently holds an ACTIVE Stripe subscription.
     * Use this for decisions that must reflect actual paid state (payment link "already paid",
     * markPendingPayment guards, seed/reset logic, etc.).
     */
    public function hasPaidSubscription(): bool
    {
        return $this->subscriptionStatusEnum() === SubscriptionStatus::ACTIVE;
    }

    /**
     * Effective org-wide access, honoring the runtime Billing Enforcement toggle.
     *
     * - GRACE status          => always true (manual or lifecycle grace bypasses billing)
     * - Enforcement disabled  => always true (all accounts work freely)
     * - Enforcement enabled   => true only when the company has a paid ACTIVE subscription
     *
     * Use this for API payloads and any gating logic that must mirror middleware behavior.
     */
    public function hasEffectiveSubscriptionAccess(): bool
    {
        if ($this->isDemo()) {
            return true;
        }

        if ($this->subscriptionStatusEnum() === SubscriptionStatus::GRACE) {
            return true;
        }

        if (! app(BillingEnforcementSettingService::class)->isEnabled()) {
            return true;
        }

        return $this->hasPaidSubscription();
    }

    /**
     * Backwards-compatible alias for effective access.
     *
     * @deprecated Prefer hasEffectiveSubscriptionAccess() or hasPaidSubscription() explicitly.
     */
    public function hasActiveSubscription(): bool
    {
        return $this->hasEffectiveSubscriptionAccess();
    }

    public function isDemo(): bool
    {
        if ((bool) $this->is_demo) {
            return true;
        }

        $publicId = trim((string) $this->company_id);

        return $publicId !== ''
            && in_array($publicId, config('demo.company_public_ids', []), true);
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

    /**
     * @return array{minimum_photos_required: int, visit_verification_required: bool}
     */
    public function operationalDefaults(): array
    {
        $settings = is_array($this->settings) ? $this->settings : [];
        $defaults = $settings['operational_defaults'] ?? [];

        return [
            'minimum_photos_required' => max(0, (int) ($defaults['minimum_photos_required'] ?? 1)),
            'visit_verification_required' => (bool) ($defaults['visit_verification_required'] ?? false),
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

    public function zones(): HasMany
    {
        return $this->hasMany(CompanyZone::class);
    }

    public function reminderLogs(): HasMany
    {
        return $this->hasMany(SubscriptionReminderLog::class);
    }

    public function mapCredit(): HasOne
    {
        return $this->hasOne(CompanyMapCredit::class);
    }

    public function mapCreditTransactions(): HasMany
    {
        return $this->hasMany(MapCreditTransaction::class);
    }
}
