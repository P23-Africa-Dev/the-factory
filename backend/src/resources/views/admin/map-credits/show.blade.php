@extends('layouts.admin')

@section('title', 'Map Credits — ' . $company->name)
@section('page-title', 'Map Credits')

@section('breadcrumb')
    <li class="breadcrumb-item"><a href="{{ route('admin.map-credits.index') }}" class="text-decoration-none"
            style="color:var(--text-muted)">Map Credits</a></li>
    <li class="breadcrumb-item active">{{ $company->name }}</li>
@endsection

@section('content')
    @php $rate = $creditsPerUsd > 0 ? $creditsPerUsd : 100; @endphp

    <div class="mb-4">
        <h4 class="fw-bold mb-1" style="font-size:1.05rem">{{ $company->name }}</h4>
        <p class="mb-0" style="font-size:.82rem;color:var(--text-secondary)">
            {{ $company->company_id }} · Plan: {{ $snapshot['plan_label'] ?? '—' }}
            @if (! $snapshot['metered'])
                · <span class="badge-status badge-inactive">Not metered (demo / enforcement off)</span>
            @endif
        </p>
    </div>

    <div class="row g-3 mb-4">
        <div class="col-6 col-lg-3">
            <div class="stat-card p-3">
                <div class="stat-label mb-1">Balance</div>
                <div class="stat-value">{{ number_format($snapshot['balance'], 0) }}</div>
                <div style="font-size:.75rem;color:var(--text-muted)">≈ ${{ number_format($snapshot['balance_usd'], 2) }}</div>
            </div>
        </div>
        <div class="col-6 col-lg-3">
            <div class="stat-card p-3">
                <div class="stat-label mb-1">Allocation / cycle</div>
                <div class="stat-value">{{ number_format($snapshot['allocation_credits'], 0) }}</div>
                <div style="font-size:.75rem;color:var(--text-muted)">Plan left: {{ number_format($snapshot['plan_credits'], 0) }}</div>
            </div>
        </div>
        <div class="col-6 col-lg-3">
            <div class="stat-card p-3">
                <div class="stat-label mb-1">Top-up credits</div>
                <div class="stat-value">{{ number_format($snapshot['topup_credits'], 0) }}</div>
                <div style="font-size:.75rem;color:var(--text-muted)">Rolls over</div>
            </div>
        </div>
        <div class="col-6 col-lg-3">
            <div class="stat-card p-3">
                <div class="stat-label mb-1">Lifetime consumed</div>
                <div class="stat-value">{{ number_format($snapshot['lifetime_consumed'], 0) }}</div>
                <div style="font-size:.75rem;color:var(--text-muted)">≈ ${{ number_format($snapshot['lifetime_consumed'] / $rate, 2) }}</div>
            </div>
        </div>
    </div>

    <div class="row g-3">
        <div class="col-lg-4">
            <div class="metric-card p-4 mb-3">
                <div class="section-label"><i class="bi bi-bar-chart"></i>Usage by SKU</div>
                <table class="table admin-table mb-0">
                    <thead>
                        <tr><th>SKU</th><th>Calls</th><th>Credits</th></tr>
                    </thead>
                    <tbody>
                        @forelse ($bySku as $row)
                            <tr>
                                <td>{{ $row->sku ?? '—' }}</td>
                                <td>{{ number_format((int) $row->calls) }}</td>
                                <td>{{ number_format((float) $row->credits, 1) }}</td>
                            </tr>
                        @empty
                            <tr><td colspan="3" class="text-center py-3" style="color:var(--text-muted)">No consumption yet.</td></tr>
                        @endforelse
                    </tbody>
                </table>
            </div>

            <div class="metric-card p-4">
                <div class="section-label"><i class="bi bi-plus-slash-minus"></i>Manual Adjustment</div>
                <form action="{{ route('admin.map-credits.companies.adjust', $company) }}" method="POST" class="row g-2">
                    @csrf
                    <div class="col-12">
                        <label class="form-label small fw-semibold">Credits (use a negative value to deduct)</label>
                        <input type="number" step="0.01" name="credits" class="form-control form-control-sm" required>
                    </div>
                    <div class="col-12">
                        <label class="form-label small fw-semibold">Reason</label>
                        <input type="text" name="reason" class="form-control form-control-sm" maxlength="255">
                    </div>
                    <div class="col-12">
                        <button type="submit" class="btn btn-sm btn-outline-primary"><i class="bi bi-check2 me-1"></i>Apply</button>
                    </div>
                </form>
            </div>
        </div>

        <div class="col-lg-8">
            <div class="metric-card p-0 overflow-hidden">
                <div class="px-4 py-3" style="border-bottom:1px solid var(--border)">
                    <div class="section-label mb-0"><i class="bi bi-clock-history"></i>Transaction History</div>
                </div>
                <div class="table-responsive">
                    <table class="table admin-table mb-0">
                        <thead>
                            <tr>
                                <th>When</th>
                                <th>Type</th>
                                <th>SKU</th>
                                <th>Credits</th>
                                <th>Balance</th>
                                <th>Source</th>
                            </tr>
                        </thead>
                        <tbody>
                            @forelse ($transactions as $tx)
                                <tr>
                                    <td style="font-size:.75rem">{{ $tx->created_at?->format('M j, Y g:i A') }}</td>
                                    <td>{{ ucfirst(str_replace('_', ' ', $tx->type)) }}</td>
                                    <td>{{ $tx->sku ?? '—' }}</td>
                                    <td class="{{ (float) $tx->credits < 0 ? 'text-danger' : 'text-success' }}">
                                        {{ (float) $tx->credits > 0 ? '+' : '' }}{{ number_format((float) $tx->credits, 2) }}
                                    </td>
                                    <td>{{ number_format((float) $tx->balance_after, 0) }}</td>
                                    <td style="font-size:.75rem;color:var(--text-muted)">{{ $tx->source }}</td>
                                </tr>
                            @empty
                                <tr><td colspan="6" class="text-center py-4" style="color:var(--text-muted)">No transactions yet.</td></tr>
                            @endforelse
                        </tbody>
                    </table>
                </div>
                @if ($transactions->hasPages())
                    <div class="px-4 py-3">{{ $transactions->links() }}</div>
                @endif
            </div>
        </div>
    </div>
@endsection
