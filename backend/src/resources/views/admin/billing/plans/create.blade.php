@extends('layouts.admin')

@section('title', 'Create Billing Plan')
@section('page-title', 'Create Billing Plan')

@section('breadcrumb')
    <li class="breadcrumb-item"><a href="{{ route('admin.billing.index') }}" class="text-decoration-none"
            style="color:var(--text-muted)">Billing</a></li>
    <li class="breadcrumb-item"><a href="{{ route('admin.billing.plans.index') }}" class="text-decoration-none"
            style="color:var(--text-muted)">Plans</a></li>
    <li class="breadcrumb-item active">Create</li>
@endsection

@section('content')
    <div class="metric-card p-4">
        <form method="POST" action="{{ route('admin.billing.plans.store') }}" class="row g-3">
            @csrf

            <div class="col-md-4">
                <label class="form-label small fw-semibold">Plan Key</label>
                <input type="text" name="plan_key" class="form-control" value="{{ old('plan_key') }}" required>
                <div style="font-size:.72rem;color:var(--text-muted)" class="mt-1">Example: up_to_250</div>
            </div>

            <div class="col-md-8">
                <label class="form-label small fw-semibold">Label</label>
                <input type="text" name="label" class="form-control" value="{{ old('label') }}" required>
            </div>

            <div class="col-md-4">
                <label class="form-label small fw-semibold">Seat Limit</label>
                <input type="number" min="1" name="seat_limit" class="form-control"
                    value="{{ old('seat_limit', 5) }}" required>
            </div>

            <div class="col-md-4">
                <label class="form-label small fw-semibold">Monthly Amount (cents)</label>
                <input type="number" min="0" name="monthly_amount" class="form-control"
                    value="{{ old('monthly_amount', 0) }}" required>
            </div>

            <div class="col-md-4">
                <label class="form-label small fw-semibold">Annual Amount (cents)</label>
                <input type="number" min="0" name="annual_amount" class="form-control"
                    value="{{ old('annual_amount', 0) }}" required>
            </div>

            <div class="col-md-6">
                <label class="form-label small fw-semibold">Monthly Stripe Price ID</label>
                <input type="text" name="monthly_price_id" class="form-control" value="{{ old('monthly_price_id') }}"
                    placeholder="price_...">
            </div>

            <div class="col-md-6">
                <label class="form-label small fw-semibold">Annual Stripe Price ID</label>
                <input type="text" name="annual_price_id" class="form-control" value="{{ old('annual_price_id') }}"
                    placeholder="price_...">
            </div>

            <div class="col-md-4">
                <label class="form-label small fw-semibold">Sort Order</label>
                <input type="number" min="0" name="sort_order" class="form-control"
                    value="{{ old('sort_order', 0) }}">
            </div>

            <div class="col-md-8 d-flex align-items-end">
                <div class="form-check mb-2">
                    <input class="form-check-input" type="checkbox" id="is_active" name="is_active" value="1"
                        @checked(old('is_active', true))>
                    <label class="form-check-label" for="is_active">
                        Active plan (visible in public subscription catalog)
                    </label>
                </div>
            </div>

            <div class="col-12 d-flex gap-2">
                <button type="submit" class="btn btn-primary btn-sm">
                    <i class="bi bi-check2-circle me-1"></i>Create plan
                </button>
                <a href="{{ route('admin.billing.plans.index') }}" class="btn btn-outline-secondary btn-sm">Cancel</a>
            </div>
        </form>
    </div>
@endsection
