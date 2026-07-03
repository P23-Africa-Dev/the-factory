@extends('layouts.admin')

@section('title', 'Billing Plans')
@section('page-title', 'Billing Plans')

@section('breadcrumb')
    <li class="breadcrumb-item"><a href="{{ route('admin.billing.index') }}" class="text-decoration-none"
            style="color:var(--text-muted)">Billing</a></li>
    <li class="breadcrumb-item active">Plans</li>
@endsection

@section('content')

    <div class="d-flex align-items-center justify-content-between mb-3 gap-2 flex-wrap">
        <p class="mb-0" style="font-size:.82rem;color:var(--text-secondary)">
            Configure subscription tiers, Stripe price IDs, and visibility status.
        </p>
        <a href="{{ route('admin.billing.plans.create') }}" class="btn btn-sm btn-primary">
            <i class="bi bi-plus-lg me-1"></i>New Plan
        </a>
    </div>

    <div class="metric-card p-0 overflow-hidden">
        <div class="table-responsive">
            <table class="table admin-table mb-0">
                <thead>
                    <tr>
                        <th>Plan</th>
                        <th>Seats</th>
                        <th>Monthly</th>
                        <th>Annual</th>
                        <th>Stripe IDs</th>
                        <th>Status</th>
                        <th class="text-end">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    @forelse ($plans as $plan)
                        <tr>
                            <td>
                                <div class="fw-semibold">{{ $plan->label }}</div>
                                <div style="font-size:.75rem;color:var(--text-muted)">{{ $plan->plan_key }}</div>
                            </td>
                            <td>{{ $plan->seat_limit }}</td>
                            <td>{{ \App\Support\Billing\BillingPlanCatalog::formatUsd((int) $plan->monthly_amount) }}</td>
                            <td>{{ \App\Support\Billing\BillingPlanCatalog::formatUsd((int) $plan->annual_amount) }}</td>
                            <td>
                                <div style="font-size:.75rem;color:var(--text-secondary)">M:
                                    {{ $plan->monthly_price_id ?: '—' }}</div>
                                <div style="font-size:.75rem;color:var(--text-secondary)">A:
                                    {{ $plan->annual_price_id ?: '—' }}</div>
                            </td>
                            <td>
                                @if ($plan->is_active)
                                    <span class="badge-status badge-approved">Active</span>
                                @else
                                    <span class="badge-status badge-inactive">Inactive</span>
                                @endif
                            </td>
                            <td class="text-end">
                                <div class="d-inline-flex gap-2">
                                    <a href="{{ route('admin.billing.plans.edit', $plan) }}"
                                        class="btn btn-outline-secondary btn-sm">
                                        <i class="bi bi-pencil-square"></i>
                                    </a>
                                    <form method="POST" action="{{ route('admin.billing.plans.destroy', $plan) }}"
                                        onsubmit="return confirm('Delete this plan? This cannot be undone.');">
                                        @csrf
                                        @method('DELETE')
                                        <button type="submit" class="btn btn-outline-danger btn-sm">
                                            <i class="bi bi-trash"></i>
                                        </button>
                                    </form>
                                </div>
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="7" class="text-center py-4" style="color:var(--text-muted)">
                                No billing plans found. Create a plan to get started.
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>
    </div>

    <div class="mt-3">
        {{ $plans->links() }}
    </div>
@endsection
