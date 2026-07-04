@extends('layouts.admin')

@section('title', 'Database Manager - Locked')
@section('page-title', 'Manage Database')

@section('breadcrumb')
    <li class="breadcrumb-item"><a href="{{ route('admin.dashboard') }}" class="text-decoration-none">Home</a></li>
    <li class="breadcrumb-item active">Database</li>
@endsection

@section('content')
<div class="row justify-content-center">
    <div class="col-lg-7">
        <div class="metric-card p-4 mb-3" style="border: 2px solid var(--danger, #dc2626); background: rgba(220,38,38,0.04)">
            <div class="d-flex align-items-center gap-2 mb-2">
                <i class="bi bi-shield-exclamation" style="font-size:1.3rem;color:var(--danger, #dc2626)"></i>
                <h4 class="mb-0 fw-bold" style="font-size:1rem;color:var(--danger, #dc2626)">Sensitive Environment</h4>
            </div>
            <p class="mb-0" style="font-size:.83rem;color:var(--text-secondary)">
                You are entering the Manage Database area. Every action here directly affects live application data,
                including schema and rows across all tables. Proceed with extreme caution. All actions are audit logged.
            </p>
        </div>

        <div class="metric-card p-4">
            <h5 class="fw-bold mb-3" style="font-size:.95rem"><i class="bi bi-lock-fill me-2"></i>Enter Passcode</h5>

            @if (session('status'))
                <div class="alert alert-info py-2" style="font-size:.82rem">{{ session('status') }}</div>
            @endif

            @if (! $configured)
                <div class="alert alert-warning py-2" style="font-size:.82rem">
                    No passcode has been set yet. Use the Master Reset Token below to set one.
                </div>
            @else
                <form method="POST" action="{{ route('admin.database.unlock') }}">
                    @csrf
                    <div class="mb-3">
                        <label class="form-label small fw-semibold" for="passcode">Passcode</label>
                        <input id="passcode" type="password" name="passcode" class="form-control @error('passcode') is-invalid @enderror" autofocus required>
                        @error('passcode')<div class="invalid-feedback">{{ $message }}</div>@enderror
                    </div>
                    <button type="submit" class="btn btn-danger btn-sm">
                        <i class="bi bi-unlock me-1"></i>Unlock Database Manager
                    </button>
                    @if ($rotatedAt)
                        <div class="mt-3" style="font-size:.72rem;color:var(--text-muted)">
                            Last rotated: {{ \Illuminate\Support\Carbon::parse($rotatedAt)->diffForHumans() }}
                        </div>
                    @endif
                </form>
            @endif
        </div>

        <div class="metric-card p-4 mt-3">
            <h6 class="fw-bold mb-2" style="font-size:.9rem"><i class="bi bi-key me-2"></i>Reset Passcode With Master Token</h6>
            <p style="font-size:.78rem;color:var(--text-secondary)">
                If you have the prime reset token (managed via Kubernetes secret), you can reset the passcode below.
                @if (! $masterTokenConfigured)
                    <br><strong style="color:var(--danger, #dc2626)">Not configured on this environment.</strong>
                @endif
            </p>
            <form method="POST" action="{{ route('admin.database.passcode.reset') }}">
                @csrf
                <div class="row g-2">
                    <div class="col-md-12">
                        <label class="form-label small fw-semibold">Master Reset Token</label>
                        <input type="password" name="master_token" class="form-control @error('master_token') is-invalid @enderror" required>
                        @error('master_token')<div class="invalid-feedback">{{ $message }}</div>@enderror
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-semibold">New Passcode</label>
                        <input type="password" name="new_passcode" class="form-control @error('new_passcode') is-invalid @enderror" minlength="8" required>
                        @error('new_passcode')<div class="invalid-feedback">{{ $message }}</div>@enderror
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-semibold">Confirm New Passcode</label>
                        <input type="password" name="new_passcode_confirmation" class="form-control" minlength="8" required>
                    </div>
                </div>
                <button type="submit" class="btn btn-outline-danger btn-sm mt-3"
                    onclick="return confirm('Reset the database manager passcode? This will invalidate the current passcode for all admins.')">
                    <i class="bi bi-arrow-repeat me-1"></i>Reset Passcode
                </button>
            </form>
        </div>
    </div>
</div>
@endsection
