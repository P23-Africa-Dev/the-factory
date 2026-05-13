@extends('layouts.admin')

@section('title', 'Dashboard')
@section('page-title', 'Dashboard')

@section('content')

{{-- ── Welcome ───────────────────────────────────────── --}}
<div class="d-flex align-items-center justify-content-between mb-4">
    <div>
        <h4 class="fw-bold mb-1" style="font-size:1.15rem">Welcome back, {{ auth('admin')->user()?->name }}</h4>
        <p class="mb-0" style="font-size:.82rem;color:var(--text-secondary)">Here's an overview of your platform activity.</p>
    </div>
    <span class="d-none d-md-inline-flex align-items-center gap-1" style="font-size:.78rem;color:var(--text-muted)">
        <i class="bi bi-clock"></i>{{ now()->format('l, M j, Y') }}
    </span>
</div>

{{-- ── Stats Grid ────────────────────────────────────── --}}
<div class="row g-3 mb-4">

    @php
        $statCards = [
            ['label' => 'Total Users',   'value' => $stats['total_users'],     'icon' => 'bi-people-fill',       'color' => '#6366f1', 'bg' => 'rgba(99,102,241,.08)'],
            ['label' => 'Active',        'value' => $stats['active_users'],    'icon' => 'bi-check-circle-fill', 'color' => '#10b981', 'bg' => 'rgba(16,185,129,.08)'],
            ['label' => 'Suspended',     'value' => $stats['suspended_users'], 'icon' => 'bi-pause-circle-fill', 'color' => '#f59e0b', 'bg' => 'rgba(245,158,11,.08)'],
            ['label' => 'Inactive',      'value' => $stats['inactive_users'],  'icon' => 'bi-x-circle-fill',     'color' => '#ef4444', 'bg' => 'rgba(239,68,68,.08)'],
            ['label' => 'Verified',      'value' => $stats['verified_users'],  'icon' => 'bi-shield-check',      'color' => '#3b82f6', 'bg' => 'rgba(59,130,246,.08)'],
            ['label' => 'Onboarded',     'value' => $stats['onboarded_users'], 'icon' => 'bi-check2-circle',     'color' => '#14b8a6', 'bg' => 'rgba(20,184,166,.08)'],
            ['label' => 'New (7 Days)',  'value' => $stats['new_users_7d'],    'icon' => 'bi-graph-up-arrow',    'color' => '#8b5cf6', 'bg' => 'rgba(139,92,246,.08)'],
        ];
    @endphp

    @foreach ($statCards as $card)
        <div class="col-6 col-md-4 col-xl-3">
            <div class="stat-card p-3">
                <div class="d-flex align-items-start justify-content-between">
                    <div>
                        <div class="stat-label mb-2">{{ $card['label'] }}</div>
                        <div class="stat-value" style="color:{{ $card['color'] }}">{{ number_format($card['value']) }}</div>
                    </div>
                    <div class="stat-icon" style="background:{{ $card['bg'] }};color:{{ $card['color'] }}">
                        <i class="bi {{ $card['icon'] }}"></i>
                    </div>
                </div>
            </div>
        </div>
    @endforeach

</div>

{{-- ── Bottom Row: Recent Users + Quick Actions ──────── --}}
<div class="row g-3">

    {{-- Recent Users ─────────────────────────────────── --}}
    <div class="col-lg-8">
        <div class="metric-card">
            <div class="table-card-header">
                <span class="fw-semibold" style="font-size:.85rem">
                    <i class="bi bi-clock-history me-2" style="color:var(--text-muted)"></i>Recent Users
                </span>
                <a href="{{ route('admin.users.index') }}" class="btn btn-sm btn-outline-secondary" style="font-size:.75rem">
                    View All <i class="bi bi-arrow-right ms-1"></i>
                </a>
            </div>
            <div class="table-responsive">
                <table class="table admin-table mb-0">
                    <thead>
                        <tr>
                            <th style="width:36px">#</th>
                            <th>User</th>
                            <th>Status</th>
                            <th style="width:75px">Verified</th>
                            <th style="width:100px">Joined</th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse ($recentUsers as $user)
                            @php $suspended = $user->suspended_until && $user->suspended_until->isFuture(); @endphp
                            <tr>
                                <td style="color:var(--text-muted);font-size:.75rem;font-weight:600">{{ $loop->iteration }}</td>
                                <td>
                                    <a href="{{ route('admin.users.show', $user) }}" class="text-decoration-none">
                                        <div class="fw-semibold" style="font-size:.84rem;color:var(--text-primary)">{{ $user->name }}</div>
                                        <div style="font-size:.75rem;color:var(--text-muted)">{{ $user->email }}</div>
                                    </a>
                                </td>
                                <td>
                                    @if ($suspended)
                                        <span class="badge-status badge-suspended"><i class="bi bi-pause-circle"></i>Suspended</span>
                                    @elseif ($user->is_active)
                                        <span class="badge-status badge-active"><i class="bi bi-check-circle"></i>Active</span>
                                    @else
                                        <span class="badge-status badge-inactive"><i class="bi bi-x-circle"></i>Inactive</span>
                                    @endif
                                </td>
                                <td class="text-center">
                                    @if ($user->email_verified_at)
                                        <i class="bi bi-check-circle-fill" style="color:var(--success)"></i>
                                    @else
                                        <i class="bi bi-x-circle" style="color:var(--text-muted)"></i>
                                    @endif
                                </td>
                                <td style="font-size:.78rem;color:var(--text-muted)">
                                    {{ $user->created_at?->format('M j, Y') }}
                                </td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="5" class="text-center py-4" style="color:var(--text-muted)">No users yet.</td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    {{-- Quick Actions ────────────────────────────────── --}}
    <div class="col-lg-4">
        <div class="metric-card p-4 mb-3">
            <div class="section-label"><i class="bi bi-lightning"></i>Quick Actions</div>
            <div class="d-flex flex-column gap-2">
                <a href="{{ route('admin.users.index') }}" class="btn btn-sm text-start d-flex align-items-center gap-2" style="background:var(--accent-light);color:var(--accent);font-weight:500">
                    <i class="bi bi-people"></i>Manage All Users
                </a>
                <a href="{{ route('admin.users.index') }}?status=suspended" class="btn btn-sm text-start d-flex align-items-center gap-2" style="background:rgba(245,158,11,.08);color:#d97706;font-weight:500">
                    <i class="bi bi-pause-circle"></i>Suspended Users
                </a>
                <a href="{{ route('admin.users.index') }}?status=inactive" class="btn btn-sm text-start d-flex align-items-center gap-2" style="background:rgba(100,116,139,.08);color:#475569;font-weight:500">
                    <i class="bi bi-person-x"></i>Inactive Users
                </a>
                <a href="{{ route('admin.enterprise.demo-requests.index') }}" class="btn btn-sm text-start d-flex align-items-center gap-2" style="background:rgba(59,130,246,.08);color:#2563eb;font-weight:500">
                    <i class="bi bi-building"></i>Enterprise Requests
                </a>
            </div>
        </div>

        <div class="metric-card p-4">
            <div class="section-label"><i class="bi bi-bar-chart"></i>Platform Summary</div>
            @php
                $verifiedPct  = $stats['total_users'] > 0 ? round($stats['verified_users'] / $stats['total_users'] * 100) : 0;
                $onboardedPct = $stats['total_users'] > 0 ? round($stats['onboarded_users'] / $stats['total_users'] * 100) : 0;
            @endphp
            <div class="mb-3">
                <div class="d-flex justify-content-between mb-1" style="font-size:.78rem">
                    <span style="color:var(--text-secondary)">Email Verified</span>
                    <span class="fw-semibold">{{ $verifiedPct }}%</span>
                </div>
                <div class="progress" style="height:6px;border-radius:3px;background:var(--border-light)">
                    <div class="progress-bar" style="width:{{ $verifiedPct }}%;background:var(--info);border-radius:3px"></div>
                </div>
            </div>
            <div>
                <div class="d-flex justify-content-between mb-1" style="font-size:.78rem">
                    <span style="color:var(--text-secondary)">Onboarding Complete</span>
                    <span class="fw-semibold">{{ $onboardedPct }}%</span>
                </div>
                <div class="progress" style="height:6px;border-radius:3px;background:var(--border-light)">
                    <div class="progress-bar" style="width:{{ $onboardedPct }}%;background:var(--success);border-radius:3px"></div>
                </div>
            </div>
        </div>
    </div>

</div>

@endsection

