@extends('layouts.admin')

@section('title', 'Sales Engine Access Request')
@section('page-title', 'Sales Engine Access')

@section('breadcrumb')
    <li class="breadcrumb-item">
        <a href="{{ route('admin.sales-engine.access-requests.index') }}" class="text-decoration-none"
            style="color:var(--text-muted)">Sales Engine Access</a>
    </li>
    <li class="breadcrumb-item active">{{ $accessRequest->name }}</li>
@endsection

@section('content')

    @if (session('status'))
        <div class="alert alert-success mb-3" style="font-size:.85rem">{{ session('status') }}</div>
    @endif

    @if ($errors->any())
        <div class="alert alert-danger mb-3" style="font-size:.85rem">
            <ul class="mb-0 ps-3">
                @foreach ($errors->all() as $error)
                    <li>{{ $error }}</li>
                @endforeach
            </ul>
        </div>
    @endif

    @php
        $badge = match ($accessRequest->status) {
            'approved' => 'badge-approved',
            'declined' => 'badge-inactive',
            default => 'badge-pending',
        };
    @endphp

    <div class="row g-3">
        <div class="col-lg-8">
            <div class="metric-card p-4 mb-3">
                <div class="section-label"><i class="bi bi-key"></i>Request Details</div>
                <div class="mb-3">
                    <span class="badge {{ $badge }}">{{ ucfirst($accessRequest->status) }}</span>
                </div>
                <dl class="row mb-0" style="font-size:.85rem">
                    <dt class="col-sm-3 text-muted">Name</dt>
                    <dd class="col-sm-9">{{ $accessRequest->name }}</dd>
                    <dt class="col-sm-3 text-muted">Email</dt>
                    <dd class="col-sm-9">{{ $accessRequest->email }}</dd>
                    <dt class="col-sm-3 text-muted">Company</dt>
                    <dd class="col-sm-9">{{ $accessRequest->company_name ?: '—' }}</dd>
                    <dt class="col-sm-3 text-muted">User ID</dt>
                    <dd class="col-sm-9">{{ $accessRequest->user_id }}</dd>
                    <dt class="col-sm-3 text-muted">Requested</dt>
                    <dd class="col-sm-9">{{ optional($accessRequest->requested_at)->toDayDateTimeString() ?? '—' }}</dd>
                    <dt class="col-sm-3 text-muted">Reviewed</dt>
                    <dd class="col-sm-9">
                        {{ optional($accessRequest->reviewed_at)->toDayDateTimeString() ?? '—' }}
                        @if ($accessRequest->reviewedByAdmin)
                            <span class="text-muted">({{ $accessRequest->reviewedByAdmin->name }})</span>
                        @endif
                    </dd>
                    <dt class="col-sm-3 text-muted">Notes</dt>
                    <dd class="col-sm-9">{{ $accessRequest->admin_notes ?: '—' }}</dd>
                </dl>
            </div>
        </div>

        <div class="col-lg-4">
            <div class="metric-card p-4">
                <div class="section-label"><i class="bi bi-check2-square"></i>Review</div>

                @if ($accessRequest->isPending() || $accessRequest->isDeclined())
                    <form method="POST"
                        action="{{ route('admin.sales-engine.access-requests.approve', $accessRequest) }}"
                        class="mb-3">
                        @csrf
                        <label class="form-label small fw-semibold">Admin notes (optional)</label>
                        <textarea name="admin_notes" class="form-control mb-3" rows="3">{{ old('admin_notes', $accessRequest->admin_notes) }}</textarea>
                        <button type="submit" class="btn btn-primary w-100">
                            <i class="bi bi-check-lg me-1"></i>Accept &amp; provision
                        </button>
                    </form>
                @endif

                @if ($accessRequest->isPending())
                    <form method="POST"
                        action="{{ route('admin.sales-engine.access-requests.decline', $accessRequest) }}"
                        onsubmit="return confirm('Decline this Sales Engine access request?');">
                        @csrf
                        <label class="form-label small fw-semibold">Decline reason (optional)</label>
                        <textarea name="admin_notes" class="form-control mb-3" rows="2">{{ old('admin_notes') }}</textarea>
                        <button type="submit" class="btn btn-outline-danger w-100">
                            <i class="bi bi-x-lg me-1"></i>Decline
                        </button>
                    </form>
                @endif

                @if ($accessRequest->isApproved())
                    <p class="mb-0" style="font-size:.85rem;color:var(--text-muted)">
                        This user can access Sales Engine from Factory23 via SSO.
                    </p>
                @endif
            </div>
        </div>
    </div>

@endsection
