@extends('layouts.admin')

@section('title', 'New Map Credit SKU')
@section('page-title', 'New Map Credit SKU')

@section('breadcrumb')
    <li class="breadcrumb-item"><a href="{{ route('admin.map-credits.index') }}" class="text-decoration-none"
            style="color:var(--text-muted)">Map Credits</a></li>
    <li class="breadcrumb-item active">New SKU</li>
@endsection

@section('content')
    <div class="metric-card p-4">
        <form method="POST" action="{{ route('admin.map-credits.skus.store') }}" class="row g-3">
            @csrf

            <div class="col-md-4">
                <label class="form-label small fw-semibold">SKU key</label>
                <input type="text" name="sku" class="form-control" value="{{ old('sku') }}" placeholder="e.g. routes" required>
            </div>
            <div class="col-md-8">
                <label class="form-label small fw-semibold">Label</label>
                <input type="text" name="label" class="form-control" value="{{ old('label') }}" required>
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-semibold">Credits per call</label>
                <input type="number" step="0.0001" min="0" name="credit_cost" class="form-control"
                    value="{{ old('credit_cost') }}" required>
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-semibold">Google $ / 1,000 (reference)</label>
                <input type="number" step="0.01" min="0" name="usd_per_1k" class="form-control" value="{{ old('usd_per_1k') }}">
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-semibold">Sort order</label>
                <input type="number" min="0" name="sort_order" class="form-control" value="{{ old('sort_order', 0) }}">
            </div>
            <div class="col-12">
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="is_active" name="is_active" value="1" @checked(old('is_active', true))>
                    <label class="form-check-label" for="is_active">Active</label>
                </div>
            </div>
            <div class="col-12 d-flex gap-2">
                <button type="submit" class="btn btn-primary btn-sm"><i class="bi bi-check2-circle me-1"></i>Create SKU</button>
                <a href="{{ route('admin.map-credits.index') }}" class="btn btn-outline-secondary btn-sm">Cancel</a>
            </div>
        </form>
    </div>
@endsection
