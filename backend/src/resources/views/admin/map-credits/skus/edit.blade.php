@extends('layouts.admin')

@section('title', 'Edit Map Credit SKU')
@section('page-title', 'Edit Map Credit SKU')

@section('breadcrumb')
    <li class="breadcrumb-item"><a href="{{ route('admin.map-credits.index') }}" class="text-decoration-none"
            style="color:var(--text-muted)">Map Credits</a></li>
    <li class="breadcrumb-item active">{{ $sku->sku }}</li>
@endsection

@section('content')
    <div class="metric-card p-4">
        <form method="POST" action="{{ route('admin.map-credits.skus.update', $sku) }}" class="row g-3">
            @csrf
            @method('PATCH')

            <div class="col-md-4">
                <label class="form-label small fw-semibold">SKU key</label>
                <input type="text" name="sku" class="form-control" value="{{ old('sku', $sku->sku) }}" required>
            </div>
            <div class="col-md-8">
                <label class="form-label small fw-semibold">Label</label>
                <input type="text" name="label" class="form-control" value="{{ old('label', $sku->label) }}" required>
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-semibold">Credits per call</label>
                <input type="number" step="0.0001" min="0" name="credit_cost" class="form-control"
                    value="{{ old('credit_cost', $sku->credit_cost) }}" required>
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-semibold">Google $ / 1,000 (reference)</label>
                <input type="number" step="0.01" min="0" name="usd_per_1k" class="form-control"
                    value="{{ old('usd_per_1k', $sku->usd_per_1k) }}">
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-semibold">Sort order</label>
                <input type="number" min="0" name="sort_order" class="form-control" value="{{ old('sort_order', $sku->sort_order) }}">
            </div>
            <div class="col-12">
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="is_active" name="is_active" value="1" @checked(old('is_active', $sku->is_active))>
                    <label class="form-check-label" for="is_active">Active</label>
                </div>
            </div>
            <div class="col-12 d-flex gap-2">
                <button type="submit" class="btn btn-primary btn-sm"><i class="bi bi-check2-circle me-1"></i>Save changes</button>
                <a href="{{ route('admin.map-credits.index') }}" class="btn btn-outline-secondary btn-sm">Cancel</a>
            </div>
        </form>
    </div>
@endsection
