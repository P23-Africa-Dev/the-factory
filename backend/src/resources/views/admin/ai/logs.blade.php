@extends('layouts.admin')

@section('title', 'AI Logs')
@section('page-title', 'AI Logs')

@section('breadcrumb')
    <li class="breadcrumb-item"><a href="{{ route('admin.ai.index') }}" class="text-decoration-none"
            style="color:var(--text-muted)">AI Management</a></li>
    <li class="breadcrumb-item active">Logs</li>
@endsection

@section('content')
<div class="page-container">

    <div class="filter-bar mb-3">
        <form method="GET" action="{{ route('admin.ai.logs.index') }}" class="row g-2 align-items-end">
            <div class="col-md-2">
                <label class="form-label" style="font-size:.75rem;font-weight:600;color:var(--text-secondary)">Date</label>
                <input type="date" name="date" value="{{ request('date') }}" class="form-control form-control-sm">
            </div>
            <div class="col-md-2">
                <label class="form-label"
                    style="font-size:.75rem;font-weight:600;color:var(--text-secondary)">Provider</label>
                <select name="provider" class="form-select form-select-sm">
                    <option value="">All providers</option>
                    @foreach ($providers as $p)
                        <option value="{{ $p }}" {{ request('provider') === $p ? 'selected' : '' }}>
                            {{ ucfirst($p) }}</option>
                    @endforeach
                </select>
            </div>
            <div class="col-md-2">
                <label class="form-label" style="font-size:.75rem;font-weight:600;color:var(--text-secondary)">Model</label>
                <select name="model" class="form-select form-select-sm">
                    <option value="">All models</option>
                    @foreach ($models as $m)
                        <option value="{{ $m }}" {{ request('model') === $m ? 'selected' : '' }}>
                            {{ $m }}</option>
                    @endforeach
                </select>
            </div>
            <div class="col-md-2">
                <label class="form-label"
                    style="font-size:.75rem;font-weight:600;color:var(--text-secondary)">Status</label>
                <select name="status" class="form-select form-select-sm">
                    <option value="">All statuses</option>
                    @foreach (['success', 'failed', 'timeout', 'cancelled'] as $s)
                        <option value="{{ $s }}" {{ request('status') === $s ? 'selected' : '' }}>
                            {{ ucfirst(str_replace('_', ' ', $s)) }}</option>
                    @endforeach
                </select>
            </div>
            <div class="col-md-2">
                <label class="form-label"
                    style="font-size:.75rem;font-weight:600;color:var(--text-secondary)">Tool</label>
                <input type="text" name="tool" value="{{ request('tool') }}" placeholder="Tool name"
                    class="form-control form-control-sm">
            </div>
            <div class="col-md-2">
                <label class="form-label"
                    style="font-size:.75rem;font-weight:600;color:var(--text-secondary)">Search</label>
                <input type="text" name="search" value="{{ request('search') }}" placeholder="Prompt, error…"
                    class="form-control form-control-sm">
            </div>
            <div class="col-md-1">
                <button type="submit" class="btn btn-sm btn-primary w-100"><i class="bi bi-search"></i></button>
            </div>
        </form>
    </div>

    <div class="metric-card">
        <div class="table-card-header">
            <span class="fw-bold" style="font-size:.88rem">AI Request Logs</span>
            <span style="font-size:.78rem;color:var(--text-muted)">{{ $logs->total() }} total records</span>
        </div>
        <div class="table-responsive">
            <table class="table admin-table mb-0">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>User</th>
                        <th>Organization</th>
                        <th>Provider / Model</th>
                        <th>Prompt Type</th>
                        <th>Tool</th>
                        <th>Tokens</th>
                        <th>Cost</th>
                        <th>Exec</th>
                        <th>Status</th>
                        <th class="action-col"></th>
                    </tr>
                </thead>
                <tbody>
                    @forelse($logs as $log)
                        <tr>
                            <td style="font-size:.78rem;color:var(--text-muted);white-space:nowrap">
                                {{ $log->created_at?->format('M j, H:i:s') }}</td>
                            <td style="font-size:.82rem">
                                @if ($log->user)
                                    <div class="fw-500">{{ $log->user->name }}</div>
                                    <div style="font-size:.72rem;color:var(--text-muted)">{{ $log->user->email }}</div>
                                @else
                                    <span style="color:var(--text-muted)">—</span>
                                @endif
                            </td>
                            <td style="font-size:.82rem">
                                @if ($log->company)
                                    <div class="fw-500">{{ $log->company->name }}</div>
                                @else
                                    <span style="color:var(--text-muted)">—</span>
                                @endif
                            </td>
                            <td style="font-size:.78rem">
                                <div class="fw-600 text-capitalize">{{ $log->provider }}</div>
                                <div style="color:var(--text-muted);font-family:monospace">{{ $log->model }}</div>
                            </td>
                            <td style="font-size:.78rem">{{ $log->intent_type ?? '—' }}</td>
                            <td style="font-size:.78rem;font-family:monospace">{{ $log->tool_name ?? '—' }}</td>
                            <td style="font-size:.78rem">{{ $log->total_tokens ? number_format($log->total_tokens) : '—' }}
                            </td>
                            <td style="font-size:.78rem">
                                ${{ $log->estimated_cost_usd ? number_format((float) $log->estimated_cost_usd, 4) : '0.0000' }}
                            </td>
                            <td style="font-size:.78rem">{{ $log->execution_ms ? $log->execution_ms . 'ms' : '—' }}</td>
                            <td>
                                @php
                                    $displayStatus = $log->status;
                                    if ($log->error_code === 'rate_limit') {
                                        $displayStatus = 'rate_limited';
                                    } elseif ($log->error_code === 'validation_error') {
                                        $displayStatus = 'validation_error';
                                    }
                                    $badgeClass = match ($displayStatus) {
                                        'success' => 'badge-active',
                                        'failed' => 'badge-rejected',
                                        'timeout' => 'badge-suspended',
                                        'rate_limited' => 'badge-suspended',
                                        default => 'badge-inactive',
                                    };
                                @endphp
                                <span class="badge-status {{ $badgeClass }}">{{ ucfirst(str_replace('_', ' ', $displayStatus)) }}</span>
                            </td>
                            <td class="action-col">
                                <a href="{{ route('admin.ai.logs.show', $log) }}" class="btn btn-sm btn-outline-secondary"
                                    style="padding:.25rem .5rem;font-size:.75rem">
                                    <i class="bi bi-eye"></i>
                                </a>
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="11" class="text-center py-5" style="color:var(--text-muted)">
                                <i class="bi bi-journal-x d-block mb-2" style="font-size:1.5rem"></i>
                                No logs found for the current filters.
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>
        @if ($logs->hasPages())
            <div class="table-card-footer d-flex justify-content-end">
                {{ $logs->links() }}
            </div>
        @endif
    </div>

</div>

@endsection
