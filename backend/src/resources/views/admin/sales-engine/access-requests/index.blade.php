@extends('layouts.admin')

@section('title', 'Sales Engine Access Requests')
@section('page-title', 'Sales Engine Access')

@section('breadcrumb')
    <li class="breadcrumb-item active">Sales Engine Access</li>
@endsection

@section('content')

    <div class="filter-bar">
        <form method="GET" class="row g-2 align-items-end">
            <div class="col-md-5">
                <label class="form-label small fw-semibold mb-1"
                    style="color:var(--text-secondary);font-size:.75rem">Search</label>
                <div class="input-group">
                    <span class="input-group-text"><i class="bi bi-search"
                            style="font-size:.8rem;color:var(--text-muted)"></i></span>
                    <input type="text" name="search" value="{{ $filters['search'] ?? '' }}" class="form-control"
                        placeholder="Name, email, or company…">
                </div>
            </div>
            <div class="col-md-3">
                <label class="form-label small fw-semibold mb-1"
                    style="color:var(--text-secondary);font-size:.75rem">Status</label>
                <select name="status" class="form-select">
                    <option value="">All statuses</option>
                    <option value="pending" @selected(($filters['status'] ?? '') === 'pending')>Pending</option>
                    <option value="approved" @selected(($filters['status'] ?? '') === 'approved')>Approved</option>
                    <option value="declined" @selected(($filters['status'] ?? '') === 'declined')>Declined</option>
                </select>
            </div>
            <div class="col-md-2">
                <button class="btn btn-primary w-100"><i class="bi bi-funnel me-1"></i>Filter</button>
            </div>
            @if (!empty($filters['search']) || !empty($filters['status']))
                <div class="col-md-2">
                    <a href="{{ route('admin.sales-engine.access-requests.index') }}" class="btn btn-outline-secondary w-100">
                        <i class="bi bi-x-lg me-1"></i>Clear
                    </a>
                </div>
            @endif
        </form>
    </div>

    <div class="metric-card">
        <div class="table-card-header">
            <span class="fw-semibold" style="font-size:.85rem">
                <i class="bi bi-key me-2" style="color:var(--text-muted)"></i>Access Requests
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
                        <th style="width:110px">Status</th>
                        <th style="width:120px">Requested</th>
                        <th class="action-col"></th>
                    </tr>
                </thead>
                <tbody>
                    @forelse ($requests as $item)
                        @php
                            $badge = match ($item->status) {
                                'approved' => 'badge-approved',
                                'declined' => 'badge-inactive',
                                default => 'badge-pending',
                            };
                        @endphp
                        <tr>
                            <td style="color:var(--text-muted);font-size:.8rem">{{ $item->id }}</td>
                            <td>
                                <div class="fw-semibold" style="font-size:.85rem">{{ $item->name }}</div>
                                <div style="font-size:.75rem;color:var(--text-muted)">{{ $item->email }}</div>
                            </td>
                            <td style="font-size:.85rem">{{ $item->company_name ?: '—' }}</td>
                            <td><span class="badge {{ $badge }}">{{ ucfirst($item->status) }}</span></td>
                            <td style="font-size:.8rem;color:var(--text-muted)">
                                {{ optional($item->requested_at)->format('Y-m-d') ?? '—' }}
                            </td>
                            <td class="action-col text-end">
                                <a href="{{ route('admin.sales-engine.access-requests.show', $item) }}"
                                    class="btn btn-sm btn-outline-secondary">View</a>
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="6" class="text-center py-4" style="color:var(--text-muted);font-size:.85rem">
                                No access requests yet.
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>

        @if ($requests->hasPages())
            <div class="p-3">{{ $requests->links() }}</div>
        @endif
    </div>

@endsection
