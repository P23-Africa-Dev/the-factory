@extends('layouts.admin')

@section('title', 'Billing Control')
@section('page-title', 'Billing Control')

@section('breadcrumb')
    <li class="breadcrumb-item active">Billing</li>
@endsection

@section('content')

    <div class="d-flex align-items-center justify-content-between mb-4 gap-3 flex-wrap">
        <div>
            <h4 class="fw-bold mb-1" style="font-size:1.05rem">Subscription &amp; Enforcement Controls</h4>
            <p class="mb-0" style="font-size:.82rem;color:var(--text-secondary)">
                Manage billing enforcement and subscription plans from one place.
            </p>
        </div>
        <a href="{{ route('admin.billing.plans.index') }}" class="btn btn-sm btn-outline-primary">
            <i class="bi bi-sliders me-1"></i>Manage Plans
        </a>
    </div>

    @if (($stats['misconfigured_active_plans'] ?? 0) > 0)
        <div class="alert d-flex align-items-start gap-2 mb-4"
            style="background:rgba(245,158,11,.08);color:#92400e;border:1px solid rgba(245,158,11,.25);border-radius:.5rem">
            <i class="bi bi-exclamation-triangle-fill mt-1" style="font-size:1.05rem"></i>
            <div>
                <div class="fw-semibold">
                    {{ $stats['misconfigured_active_plans'] }}
                    active {{ \Illuminate\Support\Str::plural('plan', $stats['misconfigured_active_plans']) }}
                    {{ $stats['misconfigured_active_plans'] === 1 ? 'is' : 'are' }} missing a Stripe price ID.
                </div>
                <div style="font-size:.82rem">
                    Customers cannot check out on a plan without both a monthly and annual Stripe price ID.
                    <a href="{{ route('admin.billing.plans.index') }}" class="fw-semibold text-decoration-none"
                        style="color:#92400e">Add the missing price IDs</a> to make these plans purchasable.
                </div>
            </div>
        </div>
    @endif

    <div class="row g-3 mb-4">
        <div class="col-6 col-lg-3">
            <div class="stat-card p-3">
                <div class="stat-label mb-1">Plans</div>
                <div class="stat-value">{{ $stats['active_plan_count'] }}/{{ $stats['total_plan_count'] }}</div>
                <div style="font-size:.75rem;color:var(--text-muted)">Active / Total</div>
            </div>
        </div>
        <div class="col-6 col-lg-3">
            <div class="stat-card p-3">
                <div class="stat-label mb-1">Subscribed Companies</div>
                <div class="stat-value">{{ $stats['active_subscription_companies'] }}</div>
                <div style="font-size:.75rem;color:var(--text-muted)">Active only</div>
            </div>
        </div>
        <div class="col-6 col-lg-3">
            <div class="stat-card p-3">
                <div class="stat-label mb-1">Pending Payment</div>
                <div class="stat-value">{{ $stats['pending_payment_companies'] }}</div>
                <div style="font-size:.75rem;color:var(--text-muted)">Awaiting subscription</div>
            </div>
        </div>
        <div class="col-6 col-lg-3">
            <div class="stat-card p-3">
                <div class="stat-label mb-1">Assigned Plans</div>
                <div class="stat-value">{{ $stats['assigned_plan_companies'] }}</div>
                <div style="font-size:.75rem;color:var(--text-muted)">Company-level assignments</div>
            </div>
        </div>
    </div>

    <div class="row g-3">
        <div class="col-lg-4">
            <div class="metric-card p-4 h-100">
                <div class="section-label"><i class="bi bi-shield-lock"></i>Billing Enforcement</div>

                <div class="mb-3">
                    @if ($billingEnforced)
                        <span class="badge-status badge-approved">
                            <i class="bi bi-check-circle me-1"></i>Enabled
                        </span>
                    @else
                        <span class="badge-status badge-inactive">
                            <i class="bi bi-pause-circle me-1"></i>Disabled
                        </span>
                    @endif
                </div>

                <p style="font-size:.82rem;color:var(--text-secondary)">
                    When enabled, only companies with an <strong>active</strong> subscription can access the dashboard.
                    Grace, past-due, and suspended orgs are blocked until they renew. When disabled, all accounts under every org work freely regardless of subscription state.
                </p>

                @if (!empty($enforcementSnapshot['updated_at']))
                    <p class="mb-3" style="font-size:.75rem;color:var(--text-muted)">
                        Last updated:
                        {{ \Illuminate\Support\Carbon::parse($enforcementSnapshot['updated_at'])->format('M j, Y g:i A') }}
                    </p>
                @endif

                <form action="{{ route('admin.billing.enforcement.update') }}" method="POST" class="d-grid gap-2">
                    @csrf
                    <input type="hidden" name="enabled" value="{{ $billingEnforced ? '0' : '1' }}">
                    <button type="submit"
                        class="btn btn-sm {{ $billingEnforced ? 'btn-outline-danger' : 'btn-outline-success' }}">
                        <i class="bi {{ $billingEnforced ? 'bi-toggle-off' : 'bi-toggle-on' }} me-1"></i>
                        {{ $billingEnforced ? 'Disable enforcement' : 'Enable enforcement' }}
                    </button>
                </form>
            </div>
        </div>

        <div class="col-lg-8">
            <div class="metric-card p-0 overflow-hidden h-100">
                <div class="d-flex align-items-center justify-content-between px-4 py-3"
                    style="border-bottom:1px solid var(--border)">
                    <div class="section-label mb-0"><i class="bi bi-credit-card"></i>Plan Preview</div>
                    <a href="{{ route('admin.billing.plans.index') }}" style="font-size:.78rem"
                        class="text-decoration-none">
                        View all plans <i class="bi bi-arrow-right-short"></i>
                    </a>
                </div>

                <div class="table-responsive">
                    <table class="table admin-table mb-0">
                        <thead>
                            <tr>
                                <th>Plan</th>
                                <th>Seats</th>
                                <th>Monthly</th>
                                <th>Annual</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            @forelse ($plansPreview as $plan)
                                <tr>
                                    <td>
                                        <div class="fw-semibold">{{ $plan['label'] }}</div>
                                        <div style="font-size:.75rem;color:var(--text-muted)">{{ $plan['plan_key'] }}</div>
                                    </td>
                                    <td>{{ $plan['seat_limit'] }}</td>
                                    <td>{{ \App\Support\Billing\BillingPlanCatalog::formatUsd($plan['monthly_amount']) }}
                                    </td>
                                    <td>{{ \App\Support\Billing\BillingPlanCatalog::formatUsd($plan['annual_amount']) }}
                                    </td>
                                    <td>
                                        @if ($plan['is_active'])
                                            <span class="badge-status badge-approved">Active</span>
                                        @else
                                            <span class="badge-status badge-inactive">Inactive</span>
                                        @endif
                                        @if (empty($plan['monthly_price_id']) || empty($plan['annual_price_id']))
                                            <span class="badge-status d-inline-flex align-items-center gap-1 mt-1"
                                                style="background:rgba(245,158,11,.12);color:#b45309"
                                                title="This plan is missing a Stripe price ID and cannot be purchased.">
                                                <i class="bi bi-exclamation-triangle"></i>Missing price ID
                                            </span>
                                        @endif
                                    </td>
                                </tr>
                            @empty
                                <tr>
                                    <td colspan="5" class="text-center py-4" style="color:var(--text-muted)">
                                        No plans configured yet. Create your first plan.
                                    </td>
                                </tr>
                            @endforelse
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
@endsection
