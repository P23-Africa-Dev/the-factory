@extends('layouts.admin')

@section('title', 'Enterprise Demo Request')
@section('page-title', 'Enterprise Request')

@section('breadcrumb')
    <li class="breadcrumb-item"><a href="{{ route('admin.enterprise.demo-requests.index') }}" class="text-decoration-none" style="color:var(--text-muted)">Enterprise Requests</a></li>
    <li class="breadcrumb-item active">{{ $demoRequest->full_name }}</li>
@endsection

@section('content')

<div class="row g-3">

    {{-- ── Left Column: Details ──────────────────────── --}}
    <div class="col-lg-8">
        <div class="metric-card p-4 mb-3">
            <div class="section-label"><i class="bi bi-building"></i>Request Details</div>
            @php
                $statusBadge = match($demoRequest->status) {
                    'draft'     => 'badge-inactive',
                    'pending'   => 'badge-pending',
                    'approved'  => 'badge-approved',
                    'activated' => 'badge-activated',
                    default     => 'badge-rejected',
                };
                $fields = [
                    ['Full Name',   $demoRequest->full_name],
                    ['Email',       $demoRequest->email],
                    ['Phone',       $demoRequest->phone ?? '—'],
                    ['Company',     $demoRequest->company_name],
                    ['Country',     $demoRequest->country],
                    ['Team Size',   $demoRequest->team_size],
                    ['Use Case',    $demoRequest->use_case ?? '—'],
                    ['Company ID',  $demoRequest->company?->company_id ?? '—'],
                ];
            @endphp
            <div class="detail-row">
                <div class="detail-label">Status</div>
                <div class="detail-value"><span class="badge-status {{ $statusBadge }}">{{ ucfirst($demoRequest->status) }}</span></div>
            </div>
            @foreach ($fields as [$label, $value])
                <div class="detail-row">
                    <div class="detail-label">{{ $label }}</div>
                    <div class="detail-value">{{ $value }}</div>
                </div>
            @endforeach
        </div>

        <div class="metric-card p-4">
            <div class="section-label"><i class="bi bi-calendar3"></i>Timeline</div>
            @php
                $dates = [
                    ['Requested',  $demoRequest->requested_at?->format('M j, Y H:i') ?? '—'],
                    ['Approved',   $demoRequest->approved_at?->format('M j, Y H:i') ?? 'Not yet'],
                    ['Activated',  $demoRequest->activated_at?->format('M j, Y H:i') ?? 'Not yet'],
                ];
            @endphp
            @foreach ($dates as [$label, $value])
                <div class="detail-row">
                    <div class="detail-label">{{ $label }}</div>
                    <div class="detail-value">{{ $value }}</div>
                </div>
            @endforeach

            @if ($demoRequest->admin_notes)
                <div class="mt-3 pt-3" style="border-top:1px solid var(--border-light)">
                    <div class="section-label"><i class="bi bi-chat-text"></i>Admin Notes</div>
                    <p style="font-size:.85rem;color:var(--text-secondary)" class="mb-0">{{ $demoRequest->admin_notes }}</p>
                </div>
            @endif
        </div>
    </div>

    {{-- ── Right Column: Actions ─────────────────────── --}}
    <div class="col-lg-4">
        <div class="metric-card p-4">
            <div class="section-label"><i class="bi bi-gear"></i>Admin Registration</div>

            @if (in_array($demoRequest->status, ['pending', 'draft', 'approved'], true))
                <form method="POST" action="{{ route('admin.enterprise.demo-requests.activate', $demoRequest) }}" class="d-grid gap-2">
                    @csrf
                    @method('PATCH')

                    <div>
                        <label class="form-label small fw-semibold mb-1" style="font-size:.78rem">Full Name</label>
                        <input
                            type="text"
                            name="full_name"
                            class="form-control form-control-sm"
                            value="{{ old('full_name', $demoRequest->full_name) }}"
                            required
                        >
                    </div>

                    <div>
                        <label class="form-label small fw-semibold mb-1" style="font-size:.78rem">Email</label>
                        <input
                            type="email"
                            name="email"
                            class="form-control form-control-sm"
                            value="{{ old('email', $demoRequest->email) }}"
                            required
                        >
                    </div>

                    <div>
                        <label class="form-label small fw-semibold mb-1" style="font-size:.78rem">Phone</label>
                        <input
                            type="tel"
                            name="phone"
                            class="form-control form-control-sm"
                            value="{{ old('phone', $demoRequest->phone) }}"
                            placeholder="+2348012345678"
                            pattern="^\+[1-9][0-9]{7,14}$"
                        >
                    </div>

                    <div>
                        <label class="form-label small fw-semibold mb-1" style="font-size:.78rem">Company Name</label>
                        <input
                            type="text"
                            name="company_name"
                            class="form-control form-control-sm"
                            value="{{ old('company_name', $demoRequest->company_name) }}"
                            required
                        >
                    </div>

                    <div class="row g-2">
                        <div class="col-6">
                            <label class="form-label small fw-semibold mb-1" style="font-size:.78rem">Country</label>
                            <input
                                type="text"
                                name="country"
                                class="form-control form-control-sm"
                                value="{{ old('country', $demoRequest->country) }}"
                                maxlength="100"
                                required
                            >
                        </div>
                        <div class="col-6">
                            <label class="form-label small fw-semibold mb-1" style="font-size:.78rem">Team Size</label>
                            <select name="team_size" class="form-select form-select-sm" required>
                                @foreach (App\Enums\TeamSizeEnum::values() as $teamSize)
                                    <option value="{{ $teamSize }}" @selected(old('team_size', $demoRequest->team_size) === $teamSize)>
                                        {{ $teamSize }}
                                    </option>
                                @endforeach
                            </select>
                        </div>
                    </div>

                    <div>
                        <label class="form-label small fw-semibold mb-1" style="font-size:.78rem">Purpose</label>
                        <select name="purpose" class="form-select form-select-sm" required>
                            @foreach (App\Enums\WorkspacePurposeEnum::cases() as $purpose)
                                <option
                                    value="{{ $purpose->value }}"
                                    @selected(old('purpose', $demoRequest->registration_purpose ?? App\Enums\WorkspacePurposeEnum::ENTERPRISE->value) === $purpose->value)
                                >
                                    {{ $purpose->label() }}
                                </option>
                            @endforeach
                        </select>
                    </div>

                    <div>
                        <label class="form-label small fw-semibold mb-1" style="font-size:.78rem">User Type</label>
                        <select name="user_type" class="form-select form-select-sm" required>
                            @foreach (App\Enums\UserTypeEnum::cases() as $userType)
                                <option
                                    value="{{ $userType->value }}"
                                    @selected(old('user_type', $demoRequest->registration_user_type ?? App\Enums\UserTypeEnum::OTHER->value) === $userType->value)
                                >
                                    {{ $userType->label() }}
                                </option>
                            @endforeach
                        </select>
                    </div>

                    <textarea name="admin_notes" rows="4" class="form-control form-control-sm"
                              placeholder="Optional internal notes"
                              style="border-color:var(--border);border-radius:.5rem;font-size:.85rem">{{ old('admin_notes', $demoRequest->admin_notes) }}</textarea>

                    <div>
                        <label class="form-label small fw-semibold mb-1" style="font-size:.78rem">Subscription Plan (optional)</label>
                        <select name="assigned_plan_key" class="form-select form-select-sm">
                            <option value="">No plan assigned — user chooses at checkout</option>
                            @foreach ($billingPlans as $planKey => $plan)
                                <option value="{{ $planKey }}" @selected(old('assigned_plan_key', $demoRequest->assigned_plan_key) === $planKey)>
                                    {{ $plan['label'] }}
                                </option>
                            @endforeach
                        </select>
                    </div>

                    <div>
                        <label class="form-label small fw-semibold mb-1" style="font-size:.78rem">Billing Interval (optional)</label>
                        <select name="assigned_billing_interval" class="form-select form-select-sm">
                            <option value="">Not set</option>
                            @foreach (App\Enums\BillingInterval::cases() as $interval)
                                <option value="{{ $interval->value }}" @selected(old('assigned_billing_interval', $demoRequest->assigned_billing_interval) === $interval->value)>
                                    {{ ucfirst($interval->value) }}
                                </option>
                            @endforeach
                        </select>
                    </div>

                    <button name="action" value="draft" class="btn btn-sm" style="background:rgba(59,130,246,.1);color:#2563eb;border:1px solid rgba(59,130,246,.2)">
                        <i class="bi bi-save2 me-2"></i>Save Draft
                    </button>

                    <button name="action" value="activate" class="btn btn-sm" style="background:rgba(16,185,129,.1);color:#059669;border:1px solid rgba(16,185,129,.2)">
                        <i class="bi bi-check2-circle me-2"></i>Approve &amp; Send Activation
                    </button>
                </form>
            @else
                <div class="text-center py-3">
                    <i class="bi bi-check-circle-fill d-block mb-2" style="font-size:1.5rem;color:var(--success)"></i>
                    <p style="font-size:.85rem;color:var(--text-secondary)" class="mb-0">This request has already been activated.</p>
                </div>
            @endif
        </div>

        @if ($demoRequest->company && $billingSummary)
            <div class="metric-card p-4 mt-3">
                <div class="section-label"><i class="bi bi-credit-card"></i>Billing</div>
                <div class="detail-row">
                    <div class="detail-label">Status</div>
                    <div class="detail-value">{{ ucfirst(str_replace('_', ' ', $billingSummary['status']['subscription_status'])) }}</div>
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

                @if (session('payment_link_url'))
                    <div class="alert alert-success mt-3 mb-0" style="font-size:.82rem">
                        Payment link generated:
                        <input type="text" class="form-control form-control-sm mt-2" readonly value="{{ session('payment_link_url') }}">
                    </div>
                @endif

                <form method="POST" action="{{ route('admin.enterprise.demo-requests.payment-link', $demoRequest) }}" class="mt-3 d-grid gap-2">
                    @csrf
                    <select name="plan_key" class="form-select form-select-sm" required>
                        @foreach ($billingPlans as $planKey => $plan)
                            <option value="{{ $planKey }}" @selected(old('plan_key', $demoRequest->assigned_plan_key) === $planKey)>
                                {{ $plan['label'] }}
                            </option>
                        @endforeach
                    </select>
                    <select name="interval" class="form-select form-select-sm" required>
                        @foreach (App\Enums\BillingInterval::cases() as $interval)
                            <option value="{{ $interval->value }}" @selected(old('interval', $demoRequest->assigned_billing_interval ?? 'monthly') === $interval->value)>
                                {{ ucfirst($interval->value) }}
                            </option>
                        @endforeach
                    </select>
                    <label class="form-check-label small">
                        <input type="checkbox" name="send_email" value="1" class="form-check-input me-1">
                        Email payment link to user
                    </label>
                    <button type="submit" class="btn btn-sm" style="background:rgba(16,185,129,.1);color:#059669;border:1px solid rgba(16,185,129,.2)">
                        <i class="bi bi-link-45deg me-1"></i>Generate Payment Link
                    </button>
                </form>
            </div>
        @endif
    </div>

</div>

@endsection
