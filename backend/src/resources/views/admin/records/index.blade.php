@extends('layouts.admin')

@section('title', 'Records')
@section('page-title', 'Records')

@section('breadcrumb')
    <li class="breadcrumb-item active">Records</li>
@endsection

@section('content')
    <div class="mb-4">
        <h4 class="fw-bold mb-1" style="font-size:1.05rem">Records</h4>
        <p class="mb-0" style="font-size:.82rem;color:var(--text-secondary)">
            Search and export the history that can be produced when a government, a security force, a customer, or company management asks for it.
            Sign-in history starts from the day this log was switched on. Passwords and tokens are never stored here.
        </p>
    </div>

    <div class="row g-3">
        @foreach ($reports as $key => $report)
            <div class="col-md-6 col-xl-4">
                <a href="{{ route('admin.records.show', $key) }}" class="card border-0 shadow-sm h-100 text-decoration-none">
                    <div class="card-body">
                        <h6 class="fw-semibold mb-2">{{ $report['title'] }}</h6>
                        <p class="mb-0" style="font-size:.82rem;color:var(--text-secondary)">{{ $report['description'] }}</p>
                    </div>
                </a>
            </div>
        @endforeach
        <div class="col-md-6 col-xl-4">
            <a href="{{ route('admin.records.person') }}" class="card border-0 shadow-sm h-100 text-decoration-none">
                <div class="card-body">
                    <h6 class="fw-semibold mb-2">Person pack</h6>
                    <p class="mb-0" style="font-size:.82rem;color:var(--text-secondary)">
                        Identity, sign-in, attendance, location sessions, tasks, and workforce changes for one person and one date range.
                    </p>
                </div>
            </a>
        </div>
    </div>
@endsection
