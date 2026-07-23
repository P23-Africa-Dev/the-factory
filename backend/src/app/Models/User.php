<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    protected $fillable = [
        'name',
        'email',
        'password',
        'avatar',
        'email_verified_at',
        'onboarding_completed_at',
        'enterprise_onboarding_completed_at',
        'onboarding_status',
        'internal_role',
        'assigned_zone',
        'work_days',
        'base_salary',
        'payroll_salary_type',
        'payroll_attendance_affects_pay',
        'payroll_work_days_override',
        'salary_currency',
        'commission_enabled',
        'supervisor_user_id',
        'invited_by_user_id',
        'phone_number',
        'gender',
        'internal_onboarding_completed_at',
        'is_active',
        'deactivated_at',
        'suspended_until',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'onboarding_completed_at' => 'datetime',
            'enterprise_onboarding_completed_at' => 'datetime',
            'internal_onboarding_completed_at' => 'datetime',
            'deactivated_at' => 'datetime',
            'work_days' => 'array',
            'base_salary' => 'decimal:2',
            'payroll_attendance_affects_pay' => 'boolean',
            'payroll_work_days_override' => 'integer',
            'commission_enabled' => 'boolean',
            'is_active' => 'boolean',
            'suspended_until' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function isEmailVerified(): bool
    {
        return $this->email_verified_at !== null;
    }

    public function hasCompletedOnboarding(): bool
    {
        return $this->onboarding_completed_at !== null;
    }

    public function hasCompletedEnterpriseOnboarding(): bool
    {
        return $this->enterprise_onboarding_completed_at !== null;
    }

    public function hasCompletedInternalOnboarding(): bool
    {
        return $this->internal_onboarding_completed_at !== null;
    }

    public function isActive(): bool
    {
        return (bool) $this->is_active;
    }

    public function isSuspended(): bool
    {
        return $this->suspended_until !== null && $this->suspended_until->isFuture();
    }

    public function canAuthenticate(): bool
    {
        return $this->isActive() && ! $this->isSuspended() && ! $this->trashed();
    }

    public function workspaces(): BelongsToMany
    {
        return $this->belongsToMany(Workspace::class, 'workspace_users')
            ->withPivot(['role', 'joined_at'])
            ->withTimestamps();
    }

    public function ownedWorkspaces(): HasMany
    {
        return $this->hasMany(Workspace::class, 'owner_id');
    }

    public function verifications(): HasMany
    {
        return $this->hasMany(UserVerification::class, 'email', 'email');
    }

    public function companies(): BelongsToMany
    {
        return $this->belongsToMany(Company::class, 'company_users')
            ->withPivot(['role', 'joined_at', 'preferred_pipeline_id'])
            ->withTimestamps();
    }

    public function zones(): BelongsToMany
    {
        return $this->belongsToMany(CompanyZone::class, 'user_zones', 'user_id', 'company_zone_id')
            ->withPivot(['is_primary'])
            ->withTimestamps();
    }

    public function createdTasks(): HasMany
    {
        return $this->hasMany(Task::class, 'created_by_user_id');
    }

    public function createdProjects(): HasMany
    {
        return $this->hasMany(Project::class, 'created_by_user_id');
    }

    public function managedProjects(): HasMany
    {
        return $this->hasMany(Project::class, 'project_manager_user_id');
    }

    public function projectTeams(): BelongsToMany
    {
        return $this->belongsToMany(Project::class, 'project_users')
            ->withPivot(['assigned_by_user_id', 'role'])
            ->withTimestamps();
    }

    public function uploadedProjectFiles(): HasMany
    {
        return $this->hasMany(ProjectFile::class, 'uploaded_by_user_id');
    }

    public function assignedTasks(): HasMany
    {
        return $this->hasMany(Task::class, 'assigned_agent_id');
    }

    public function taskStatusUpdates(): HasMany
    {
        return $this->hasMany(Task::class, 'last_status_updated_by_user_id');
    }

    public function taskProofs(): HasMany
    {
        return $this->hasMany(TaskProof::class, 'uploaded_by_user_id');
    }

    public function supervisor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'supervisor_user_id');
    }

    public function agents(): HasMany
    {
        return $this->hasMany(User::class, 'supervisor_user_id');
    }

    public function sentInternalInvitations(): HasMany
    {
        return $this->hasMany(InternalUserInvitation::class, 'invited_by_user_id');
    }

    public function internalInvitations(): HasMany
    {
        return $this->hasMany(InternalUserInvitation::class, 'user_id');
    }

    public function latestInternalInvitation(): HasOne
    {
        return $this->hasOne(InternalUserInvitation::class, 'user_id')->latestOfMany();
    }

    public function appNotifications(): HasMany
    {
        return $this->hasMany(AppNotification::class);
    }

    public function notificationPreferences(): HasMany
    {
        return $this->hasMany(NotificationPreference::class);
    }

    public function pushSubscriptions(): HasMany
    {
        return $this->hasMany(PushSubscription::class);
    }

    public function attendanceRecords(): HasMany
    {
        return $this->hasMany(AttendanceRecord::class);
    }

    public function attendancePayrollSummaries(): HasMany
    {
        return $this->hasMany(AttendancePayrollSummary::class);
    }

    public function ownedCalendarConnections(): HasMany
    {
        return $this->hasMany(CompanyCalendarConnection::class, 'owner_user_id');
    }

    public function calendarConnections(): HasMany
    {
        return $this->hasMany(UserCalendarConnection::class, 'user_id');
    }

    public function createdMeetings(): HasMany
    {
        return $this->hasMany(Meeting::class, 'created_by_user_id');
    }

    public function meetingAttendances(): HasMany
    {
        return $this->hasMany(MeetingAttendee::class);
    }
}
