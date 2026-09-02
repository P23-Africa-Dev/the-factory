@extends('layouts.admin')

@section('title', 'User | ' . $user->name)
@section('page-title', 'User Details')

@section('breadcrumb')
    <li class="breadcrumb-item">
        <a href="{{ route('admin.users.index', ['tab' => $isInternal ? 'internal' : 'owners']) }}"
            class="text-decoration-none" style="color:var(--text-muted)">Users</a>
    </li>
    <li class="breadcrumb-item active">{{ $user->name }}</li>
@endsection

@section('content')

    @php
        $suspended = $user->suspended_until && $user->suspended_until->isFuture();
        $isEnterprise = !$isInternal && $user->enterprise_onboarding_completed_at !== null;
        $isSelfServe = !$isInternal && !$isEnterprise && $user->onboarding_completed_at !== null;
        $canCreateSupportAccess = auth('admin')->user()?->canAccessAbility('impersonate_users') === true;
        $supportCompanies = $user->companies->where('status', 'active')->values();
        $supportOnboarded =
            $user->hasCompletedOnboarding() ||
            $user->hasCompletedEnterpriseOnboarding() ||
            $user->hasCompletedInternalOnboarding();
        $supportEligible =
            !$user->trashed() && $user->canAuthenticate() && $supportOnboarded && $supportCompanies->isNotEmpty();
    @endphp

    @if ($suspended)
        <div class="alert d-flex align-items-center gap-2 mb-4" style="background:rgba(245,158,11,.08);color:#92400e">
            <i class="bi bi-pause-circle-fill" style="font-size:1.1rem"></i>
            <div>
                This user is <strong>suspended</strong> until
                <strong>{{ $user->suspended_until->format('M j, Y \a\t g:i A') }}</strong>.
            </div>
        </div>
    @endif

    <div class="row g-3">

        {{-- ── Left Column ────────────────────────────────── --}}
        <div class="col-lg-8">

            {{-- Profile ──────────────────────────────────── --}}
            <div class="metric-card p-4 mb-3">
                <div class="section-label"><i class="bi bi-person"></i>Profile Information</div>
                @foreach ([['Name', $user->name], ['Email', $user->email], ['Phone', $user->phone_number ?? '—'], ['Gender', $user->gender ? ucfirst($user->gender) : '—']] as [$label, $value])
                    <div class="detail-row">
                        <div class="detail-label">{{ $label }}</div>
                        <div class="detail-value">{{ $value }}</div>
                    </div>
                @endforeach
            </div>

            @if (!$isInternal)
                {{-- Account & Organization (Account Owners) ─── --}}
                <div class="metric-card p-4 mb-3">
                    <div class="section-label"><i class="bi bi-building"></i>Account &amp; Organization</div>

                    <div class="detail-row">
                        <div class="detail-label">Account Type</div>
                        <div class="detail-value">
                            @if ($isEnterprise)
                                <span class="badge-status" style="background:rgba(99,102,241,.12);color:#4338ca">
                                    <i class="bi bi-building"></i>Enterprise
                                </span>
                            @elseif ($isSelfServe)
                                <span class="badge-status" style="background:rgba(16,185,129,.1);color:#059669">
                                    <i class="bi bi-person-fill"></i>Self-Serve
                                </span>
                            @else
                                <span class="badge-status" style="background:rgba(100,116,139,.1);color:var(--text-muted)">
                                    <i class="bi bi-hourglass"></i>Pending
                                </span>
                            @endif
                        </div>
                    </div>

                    @if ($isEnterprise && $company)
                        <div class="detail-row">
                            <div class="detail-label">Company Name</div>
                            <div class="detail-value">{{ $company->name }}</div>
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">Company ID</div>
                            <div class="detail-value">
                                <code
                                    style="font-size:.82rem;background:var(--bg-secondary,#f1f5f9);padding:.2em .4em;border-radius:.25rem">{{ $company->company_id }}</code>
                            </div>
                        </div>
                    @elseif ($isSelfServe && $workspace)
                        <div class="detail-row">
                            <div class="detail-label">Workspace</div>
                            <div class="detail-value">{{ $workspace->name }}</div>
                        </div>
                    @endif

                    @if ($isEnterprise && $user->enterprise_onboarding_completed_at)
                        <div class="detail-row">
                            <div class="detail-label">Onboarded At</div>
                            <div class="detail-value">{{ $user->enterprise_onboarding_completed_at->format('M j, Y H:i') }}
                            </div>
                        </div>
                    @elseif ($isSelfServe && $user->onboarding_completed_at)
                        <div class="detail-row">
                            <div class="detail-label">Onboarded At</div>
                            <div class="detail-value">{{ $user->onboarding_completed_at->format('M j, Y H:i') }}</div>
                        </div>
                    @endif
                </div>
            @else
                {{-- Organization & Hierarchy (Internal Users) ─ --}}
                <div class="metric-card p-4 mb-3">
                    <div class="section-label"><i class="bi bi-diagram-3"></i>Organization &amp; Hierarchy</div>

                    <div class="detail-row">
                        <div class="detail-label">Role</div>
                        <div class="detail-value">
                            @php
                                $roleColor = match ($user->internal_role) {
                                    'supervisor' => ['bg' => 'rgba(139,92,246,.12)', 'fg' => '#7c3aed'],
                                    'agent' => ['bg' => 'rgba(6,182,212,.12)', 'fg' => '#0891b2'],
                                    'manager' => ['bg' => 'rgba(245,158,11,.12)', 'fg' => '#d97706'],
                                    default => ['bg' => 'rgba(100,116,139,.1)', 'fg' => 'var(--text-muted)'],
                                };
                            @endphp
                            <span class="badge-status"
                                style="background:{{ $roleColor['bg'] }};color:{{ $roleColor['fg'] }}">
                                {{ ucfirst($user->internal_role) }}
                            </span>
                        </div>
                    </div>

                    <div class="detail-row">
                        <div class="detail-label">Supervisor</div>
                        <div class="detail-value">
                            @if ($user->supervisor)
                                <a href="{{ route('admin.users.show', $user->supervisor) }}" class="text-decoration-none"
                                    style="color:var(--accent)">
                                    {{ $user->supervisor->name }}
                                </a>
                                <div style="font-size:.72rem;color:var(--text-muted)">{{ $user->supervisor->email }}</div>
                            @else
                                <span style="color:var(--text-muted)">—</span>
                            @endif
                        </div>
                    </div>

                    @if ($company)
                        <div class="detail-row">
                            <div class="detail-label">Company</div>
                            <div class="detail-value">
                                {{ $company->name }}
                                <div style="font-size:.72rem;color:var(--text-muted)">{{ $company->company_id }}</div>
                            </div>
                        </div>
                    @endif

                    @if ($accountOwner)
                        <div class="detail-row">
                            <div class="detail-label">Account Owner</div>
                            <div class="detail-value">
                                <a href="{{ route('admin.users.show', $accountOwner) }}" class="text-decoration-none"
                                    style="color:var(--accent)">
                                    {{ $accountOwner->name }}
                                </a>
                                <div style="font-size:.72rem;color:var(--text-muted)">{{ $accountOwner->email }}</div>
                            </div>
                        </div>
                    @endif
                </div>

                {{-- Agents (Supervisors only) ────────────────── --}}
                @if ($user->internal_role === 'supervisor' && $user->agents->isNotEmpty())
                    <div class="metric-card p-4 mb-3">
                        <div class="section-label"><i class="bi bi-headset"></i>Agents ({{ $user->agents->count() }})</div>
                        @foreach ($user->agents as $agent)
                            <div class="detail-row">
                                <div class="detail-label" style="flex:0 0 auto">
                                    <span class="badge-status"
                                        style="background:rgba(6,182,212,.12);color:#0891b2;font-size:.68rem">Agent</span>
                                </div>
                                <div class="detail-value">
                                    <a href="{{ route('admin.users.show', $agent) }}"
                                        class="text-decoration-none fw-semibold"
                                        style="font-size:.85rem;color:var(--text-primary)">
                                        {{ $agent->name }}
                                    </a>
                                    <div style="font-size:.72rem;color:var(--text-muted)">{{ $agent->email }}</div>
                                </div>
                            </div>
                        @endforeach
                    </div>
                @endif
            @endif

            {{-- Timestamps ───────────────────────────────── --}}
            <div class="metric-card p-4">
                <div class="section-label"><i class="bi bi-calendar3"></i>Timestamps</div>
                @foreach ([['Registered', $user->created_at?->format('M j, Y H:i')], ['Email Verified', $user->email_verified_at?->format('M j, Y H:i') ?? 'Not verified'], ['Deactivated', $user->deactivated_at?->format('M j, Y H:i') ?? '—'], ['Suspended Until', $user->suspended_until?->format('M j, Y H:i') ?? '—']] as [$label, $value])
                    <div class="detail-row">
                        <div class="detail-label">{{ $label }}</div>
                        <div class="detail-value">{{ $value }}</div>
                    </div>
                @endforeach
            </div>

        </div>

        {{-- ── Right Column: Actions ─────────────────────── --}}
        <div class="col-lg-4">

            @if ($canCreateSupportAccess)
                {{-- Support Access ───────────────────────────── --}}
                <div class="metric-card p-4 mb-3" style="border-color:rgba(79,70,229,.2)">
                    <div class="section-label" style="color:#4338ca">
                        <i class="bi bi-headset"></i>Support Access
                    </div>
                    <p style="font-size:.8rem;color:var(--text-secondary)" class="mb-3">
                        Passwords are one-way hashed and cannot be viewed. Start a short-lived, audited
                        support session instead. Read-only access is the default.
                    </p>

                    @if ($supportEligible)
                        <div class="d-grid">
                            <button class="btn btn-sm"
                                style="background:rgba(79,70,229,.1);color:#4338ca;border:1px solid rgba(79,70,229,.2)"
                                data-bs-toggle="modal" data-bs-target="#supportAccessModal">
                                <i class="bi bi-box-arrow-up-right me-2"></i>Access Account
                            </button>
                        </div>
                    @else
                        <div class="alert alert-warning mb-0 py-2" style="font-size:.78rem">
                            Support access requires an active, onboarded user with an active company membership.
                        </div>
                    @endif
                </div>
            @endif

            {{-- Account Status ───────────────────────────── --}}
            <div class="metric-card p-4 mb-3">
                <div class="section-label"><i class="bi bi-person-gear"></i>Account Status</div>
                <div class="mb-3">
                    @if ($suspended)
                        <span class="badge-status badge-suspended" style="font-size:.8rem;padding:.4rem .85rem">
                            <i class="bi bi-pause-circle"></i>Suspended
                        </span>
                    @elseif ($user->is_active)
                        <span class="badge-status badge-active" style="font-size:.8rem;padding:.4rem .85rem">
                            <i class="bi bi-check-circle"></i>Active
                        </span>
                    @else
                        <span class="badge-status badge-inactive" style="font-size:.8rem;padding:.4rem .85rem">
                            <i class="bi bi-x-circle"></i>Inactive
                        </span>
                    @endif
                </div>

                @if ($user->is_active && !$suspended)
                    <div class="d-grid gap-2">
                        <button class="btn btn-outline-warning btn-sm" data-bs-toggle="modal"
                            data-bs-target="#suspendModal">
                            <i class="bi bi-pause-circle me-2"></i>Suspend User
                        </button>
                        <form method="POST" action="{{ route('admin.users.status.update', $user) }}">
                            @csrf @method('PATCH')
                            <input type="hidden" name="is_active" value="0">
                            <button class="btn btn-outline-secondary btn-sm w-100">
                                <i class="bi bi-person-dash me-2"></i>Deactivate User
                            </button>
                        </form>
                    </div>
                @else
                    <form method="POST" action="{{ route('admin.users.reactivate', $user) }}" class="d-grid">
                        @csrf
                        <button class="btn btn-sm"
                            style="background:rgba(16,185,129,.1);color:#059669;border:1px solid rgba(16,185,129,.2)">
                            <i class="bi bi-play-circle me-2"></i>Reactivate User
                        </button>
                    </form>
                @endif
            </div>

            {{-- Role Management ──────────────────────────── --}}
            <div class="metric-card p-4 mb-3">
                <div class="section-label"><i class="bi bi-shield-check"></i>Role Management</div>
                <form method="POST" action="{{ route('admin.users.role.update', $user) }}">
                    @csrf @method('PATCH')
                    <div class="mb-2">
                        <select name="internal_role" class="form-select form-select-sm"
                            style="border-color:var(--border);border-radius:.5rem;font-size:.85rem">
                            <option value="">— No Role (Account Owner) —</option>
                            @foreach (['agent', 'supervisor', 'manager'] as $role)
                                <option value="{{ $role }}" @selected($user->internal_role === $role)>{{ ucfirst($role) }}
                                </option>
                            @endforeach
                        </select>
                    </div>
                    <div class="d-grid">
                        <button type="submit" class="btn btn-primary btn-sm">
                            <i class="bi bi-floppy me-1"></i>Save Role
                        </button>
                    </div>
                </form>
            </div>

            @if (!$isInternal && $company && $billingSummary)
                <div class="metric-card p-4 mb-3">
                    <div class="section-label"><i class="bi bi-credit-card"></i>Billing</div>
                    <div class="detail-row">
                        <div class="detail-label">Status</div>
                        <div class="detail-value">
                            {{ ucfirst(str_replace('_', ' ', $billingSummary['status']['subscription_status'])) }}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Plan</div>
                        <div class="detail-value">{{ $billingSummary['status']['plan_key'] ?? '—' }}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Seats</div>
                        <div class="detail-value">
                            {{ $billingSummary['seat_usage']['used'] }}
                            @if ($billingSummary['seat_usage']['limit'])
                                / {{ $billingSummary['seat_usage']['limit'] }}
                            @endif
                        </div>
                    </div>

                    @if (session('status'))
                        <div class="alert alert-success mt-3 mb-0" style="font-size:.82rem">{{ session('status') }}</div>
                    @endif

                    <form method="POST" action="{{ route('admin.billing.companies.demo.update', $company) }}"
                        class="mt-3">
                        @csrf
                        <input type="hidden" name="is_demo" value="{{ $company->is_demo ? '0' : '1' }}">
                        <button type="submit" class="btn btn-sm w-100"
                            style="background:rgba(99,102,241,.1);color:#4f46e5;border:1px solid rgba(99,102,241,.2)">
                            <i class="bi bi-{{ $company->is_demo ? 'x-circle' : 'play-circle' }} me-1"></i>
                            {{ $company->is_demo ? 'Remove demo access' : 'Mark as demo account' }}
                        </button>
                    </form>

                    @if (session('payment_link_url'))
                        <div class="alert alert-success mt-3 mb-0" style="font-size:.82rem">
                            Payment link generated:
                            <input type="text" class="form-control form-control-sm mt-2" readonly
                                value="{{ session('payment_link_url') }}">
                        </div>
                    @endif

                    <form method="POST" action="{{ route('admin.users.payment-link', $user) }}"
                        class="mt-3 d-grid gap-2">
                        @csrf
                        <select name="plan_key" class="form-select form-select-sm" required>
                            @foreach ($billingPlans as $planKey => $plan)
                                <option value="{{ $planKey }}" @selected(old('plan_key', $company->assigned_plan_key) === $planKey)>
                                    {{ $plan['label'] }}
                                </option>
                            @endforeach
                        </select>
                        <select name="interval" class="form-select form-select-sm" required>
                            @foreach (App\Enums\BillingInterval::cases() as $interval)
                                <option value="{{ $interval->value }}" @selected(old('interval', $company->assigned_billing_interval ?? 'monthly') === $interval->value)>
                                    {{ ucfirst($interval->value) }}
                                </option>
                            @endforeach
                        </select>
                        <label class="form-check-label small">
                            <input type="checkbox" name="send_email" value="1" class="form-check-input me-1">
                            Email payment link to user
                        </label>
                        <button type="submit" class="btn btn-sm"
                            style="background:rgba(16,185,129,.1);color:#059669;border:1px solid rgba(16,185,129,.2)">
                            <i class="bi bi-link-45deg me-1"></i>Generate Payment Link
                        </button>
                    </form>
                </div>
            @endif

            {{-- Danger Zone ──────────────────────────────── --}}
            <div class="metric-card p-4" style="border-color:rgba(239,68,68,.2)">
                <div class="section-label" style="color:var(--danger)"><i class="bi bi-exclamation-triangle"></i>Danger
                    Zone</div>
                <p style="font-size:.8rem;color:var(--text-secondary)" class="mb-3">
                    Deleting this user is a soft-delete. The record is retained but removed from all active views.
                </p>
                <div class="d-grid">
                    <button class="btn btn-outline-danger btn-sm" data-bs-toggle="modal" data-bs-target="#deleteModal">
                        <i class="bi bi-trash3 me-2"></i>Delete User
                    </button>
                </div>
            </div>

        </div>
    </div>

    @if ($canCreateSupportAccess && $supportEligible)
        {{-- ── Support Access Modal ────────────────────────────── --}}
        <div class="modal fade" id="supportAccessModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" style="font-size:.95rem">
                            <i class="bi bi-headset me-2" style="color:#4338ca"></i>
                            Access {{ $user->name }}'s account
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <form method="POST" action="{{ route('admin.users.support-access.store', $user) }}"
                        target="_blank">
                        @csrf
                        <div class="modal-body">
                            <div class="alert alert-info py-2" style="font-size:.8rem">
                                The session expires after 15 minutes, is company-scoped, and is fully audited.
                                Security-sensitive actions remain blocked.
                            </div>

                            <div class="mb-3">
                                <label class="form-label small fw-semibold">Company</label>
                                <select name="company_id" class="form-select form-select-sm" required>
                                    @foreach ($supportCompanies as $supportCompany)
                                        <option value="{{ $supportCompany->id }}">
                                            {{ $supportCompany->name }} ({{ $supportCompany->pivot?->role }})
                                        </option>
                                    @endforeach
                                </select>
                            </div>

                            <div class="mb-3">
                                <label class="form-label small fw-semibold">Access level</label>
                                <select name="access_level" class="form-select form-select-sm" required>
                                    <option value="read_only" selected>Read-only (recommended)</option>
                                    <option value="operational_full">Operational full access</option>
                                </select>
                                <div class="form-text">
                                    Operational access still blocks passwords, billing, roles, deletion,
                                    credentials, and security settings.
                                </div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label small fw-semibold">Support reason</label>
                                <textarea name="reason" class="form-control form-control-sm" rows="3" minlength="10" maxlength="1000"
                                    required placeholder="Describe the customer issue being investigated"></textarea>
                            </div>

                            <div class="mb-3">
                                <label class="form-label small fw-semibold">Ticket reference (optional)</label>
                                <input type="text" name="ticket_reference" class="form-control form-control-sm"
                                    maxlength="191" placeholder="e.g. SUP-1042">
                            </div>

                            <div class="mb-0">
                                <label class="form-label small fw-semibold">Confirm your admin password</label>
                                <input type="password" name="admin_password" class="form-control form-control-sm"
                                    autocomplete="current-password" required>
                                <div class="form-text">Required every time support access is created.</div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">
                                Cancel
                            </button>
                            <button type="submit" class="btn btn-primary btn-sm">
                                <i class="bi bi-box-arrow-up-right me-1"></i>Start Support Session
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    @endif

    {{-- ── Suspend Modal ───────────────────────────────────── --}}
    <div class="modal fade" id="suspendModal" tabindex="-1">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" style="font-size:.95rem">
                        <i class="bi bi-pause-circle me-2" style="color:var(--warning)"></i>Suspend {{ $user->name }}
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <form method="POST" action="{{ route('admin.users.suspend', $user) }}">
                    @csrf
                    <input type="hidden" name="suspend_type" id="suspendType" value="duration">
                    <input type="hidden" name="suspend_days" id="suspendDays" value="3">
                    <div class="modal-body">
                        <p style="font-size:.85rem;color:var(--text-secondary)" class="mb-3">Choose suspension duration:
                        </p>
                        <div class="d-flex flex-wrap gap-2 mb-3">
                            <button type="button" class="btn btn-outline-secondary btn-sm active duration-btn"
                                data-days="3">3 Days</button>
                            <button type="button" class="btn btn-outline-secondary btn-sm duration-btn" data-days="7">7
                                Days</button>
                            <button type="button" class="btn btn-outline-secondary btn-sm duration-btn"
                                data-days="30">30 Days</button>
                            <button type="button" class="btn btn-outline-secondary btn-sm" id="customDateBtn">Custom
                                Date</button>
                            <button type="button" class="btn btn-outline-danger btn-sm"
                                id="permanentSuspendBtn">Permanent</button>
                        </div>
                        <div id="customDateWrap" class="d-none">
                            <label class="form-label small fw-semibold" style="font-size:.78rem">Suspend Until</label>
                            <input type="date" name="suspend_until" class="form-control form-control-sm"
                                min="{{ now()->addDay()->toDateString() }}">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-outline-secondary btn-sm"
                            data-bs-dismiss="modal">Cancel</button>
                        <button type="submit" class="btn btn-warning btn-sm">
                            <i class="bi bi-pause-circle me-1"></i>Apply Suspension
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    {{-- ── Delete Modal ────────────────────────────────────── --}}
    <div class="modal fade" id="deleteModal" tabindex="-1">
        <div class="modal-dialog modal-sm">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" style="font-size:.95rem">
                        <i class="bi bi-trash3 me-2" style="color:var(--danger)"></i>Delete User
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <form method="POST" action="{{ route('admin.users.destroy', $user) }}">
                    @csrf @method('DELETE')
                    <div class="modal-body">
                        <p style="font-size:.85rem;color:var(--text-secondary)" class="mb-0">
                            Delete <strong>{{ $user->name }}</strong>? This will soft-delete the account.
                        </p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-outline-secondary btn-sm"
                            data-bs-dismiss="modal">Cancel</button>
                        <button type="submit" class="btn btn-danger btn-sm">
                            <i class="bi bi-trash3 me-1"></i>Delete
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>

@endsection

@push('scripts')
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            document.querySelectorAll('.duration-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    document.querySelectorAll('.duration-btn, #customDateBtn, #permanentSuspendBtn')
                        .forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    document.getElementById('suspendType').value = 'duration';
                    document.getElementById('suspendDays').value = this.dataset.days;
                    document.getElementById('customDateWrap').classList.add('d-none');
                });
            });
            document.getElementById('customDateBtn')?.addEventListener('click', function() {
                document.querySelectorAll('.duration-btn, #customDateBtn, #permanentSuspendBtn').forEach(
                    b => b.classList.remove('active'));
                this.classList.add('active');
                document.getElementById('suspendType').value = 'date';
                document.getElementById('customDateWrap').classList.remove('d-none');
            });
            document.getElementById('permanentSuspendBtn')?.addEventListener('click', function() {
                document.querySelectorAll('.duration-btn, #customDateBtn, #permanentSuspendBtn').forEach(
                    b => b.classList.remove('active'));
                this.classList.add('active');
                document.getElementById('suspendType').value = 'permanent';
                document.getElementById('customDateWrap').classList.add('d-none');
            });
        });
    </script>
@endpush
