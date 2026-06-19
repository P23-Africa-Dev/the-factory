@extends('layouts.admin')

@section('title', 'Enterprise Demo Requests')
@section('page-title', 'Enterprise Requests')

@section('breadcrumb')
    <li class="breadcrumb-item active">Enterprise Requests</li>
@endsection

@section('content')

{{-- ── Filter Bar ──────────────────────────────────────── --}}
<div class="filter-bar">
    <form method="GET" class="row g-2 align-items-end">
        <div class="col-md-5">
            <label class="form-label small fw-semibold mb-1" style="color:var(--text-secondary);font-size:.75rem">Search</label>
            <div class="input-group">
                <span class="input-group-text"><i class="bi bi-search" style="font-size:.8rem;color:var(--text-muted)"></i></span>
                <input type="text" name="search" value="{{ $filters['search'] ?? '' }}"
                       class="form-control" placeholder="Name, email, phone, or company…">
            </div>
        </div>
        <div class="col-md-3">
            <label class="form-label small fw-semibold mb-1" style="color:var(--text-secondary);font-size:.75rem">Status</label>
            <select name="status" class="form-select">
                <option value="">All statuses</option>
                <option value="draft"     @selected(($filters['status'] ?? '') === 'draft')>Draft</option>
                <option value="pending"   @selected(($filters['status'] ?? '') === 'pending')>Pending</option>
                <option value="approved"  @selected(($filters['status'] ?? '') === 'approved')>Approved</option>
                <option value="activated" @selected(($filters['status'] ?? '') === 'activated')>Activated</option>
                <option value="rejected"  @selected(($filters['status'] ?? '') === 'rejected')>Rejected</option>
            </select>
        </div>
        <div class="col-md-2">
            <button class="btn btn-primary w-100"><i class="bi bi-funnel me-1"></i>Filter</button>
        </div>
        @if (!empty($filters['search']) || !empty($filters['status']))
            <div class="col-md-2">
                <a href="{{ route('admin.enterprise.demo-requests.index') }}" class="btn btn-outline-secondary w-100">
                    <i class="bi bi-x-lg me-1"></i>Clear
                </a>
            </div>
        @endif
    </form>
</div>

{{-- ── Table ───────────────────────────────────────────── --}}
<div class="metric-card">
    <div class="table-card-header">
        <span class="fw-semibold" style="font-size:.85rem">
            <i class="bi bi-building me-2" style="color:var(--text-muted)"></i>Demo Requests
        </span>
        <span style="font-size:.75rem;color:var(--text-muted)">
            Page {{ $requests->currentPage() }}
        </span>
    </div>

    <div class="table-responsive">
        <table class="table admin-table mb-0">
            <thead>
                <tr>
                    <th style="width:44px">#</th>
                    <th>Contact</th>
                    <th>Company</th>
                    <th style="width:90px">Team Size</th>
                    <th style="width:110px">Status</th>
                    <th style="width:110px">Requested</th>
                    <th class="action-col"></th>
                </tr>
            </thead>
            <tbody>
                @forelse ($requests as $requestItem)
                    @php
                        $rowNum = ($requests->currentPage() - 1) * $requests->perPage() + $loop->iteration;
                        $badgeClass = match($requestItem->status) {
                            'draft'     => 'badge-inactive',
                            'pending'   => 'badge-pending',
                            'approved'  => 'badge-approved',
                            'activated' => 'badge-activated',
                            default     => 'badge-rejected',
                        };
                    @endphp
                    <tr>
                        <td style="color:var(--text-muted);font-size:.75rem;font-weight:600">{{ $rowNum }}</td>
                        <td>
                            <a href="{{ route('admin.enterprise.demo-requests.show', $requestItem) }}" class="text-decoration-none">
                                <div class="fw-semibold" style="font-size:.85rem;color:var(--text-primary)">{{ $requestItem->full_name }}</div>
                                <div style="font-size:.75rem;color:var(--text-muted)">{{ $requestItem->email }}</div>
                                @if ($requestItem->phone)
                                    <div style="font-size:.75rem;color:var(--text-muted)">{{ $requestItem->phone }}</div>
                                @endif
                            </a>
                        </td>
                        <td style="font-size:.85rem">{{ $requestItem->company_name }}</td>
                        <td class="text-center" style="font-size:.85rem">{{ $requestItem->team_size }}</td>
                        <td>
                            <span class="badge-status {{ $badgeClass }}">{{ ucfirst($requestItem->status) }}</span>
                        </td>
                        <td style="color:var(--text-muted);font-size:.78rem">
                            {{ $requestItem->requested_at?->format('M j, Y') }}
                        </td>
                        <td class="text-center">
                            <a href="{{ route('admin.enterprise.demo-requests.show', $requestItem) }}"
                               class="btn btn-sm btn-outline-secondary py-1 px-2">
                                <i class="bi bi-eye"></i>
                            </a>
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td colspan="7" class="text-center py-5" style="color:var(--text-muted)">
                            <i class="bi bi-building d-block mb-2" style="font-size:2rem;opacity:.25"></i>
                            No requests found.
                        </td>
                    </tr>
                @endforelse
            </tbody>
        </table>
    </div>

    @if ($requests->hasPages())
        <div class="table-card-footer">
            {{ $requests->links() }}
        </div>
    @endif
</div>

@endsection
