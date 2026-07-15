@extends('layouts.admin')

@section('title', 'Map Credits')
@section('page-title', 'Map Credits')

@section('breadcrumb')
    <li class="breadcrumb-item active">Map Credits</li>
@endsection

@section('content')
    @php
        $rate = $creditsPerUsd > 0 ? $creditsPerUsd : 100;
    @endphp

    <div class="mb-4">
        <h4 class="fw-bold mb-1" style="font-size:1.05rem">Google API Usage &amp; Credit Allocation</h4>
        <p class="mb-0" style="font-size:.82rem;color:var(--text-secondary)">
            Organizations spend credits when they hit Google (map) API endpoints. Plan credits are granted as a
            percentage of each plan's monthly price and reset every cycle; purchased top-ups roll over.
        </p>
    </div>

    <div class="row g-3 mb-4">
        <div class="col-6 col-lg-3">
            <div class="stat-card p-3">
                <div class="stat-label mb-1">Organizations</div>
                <div class="stat-value">{{ $stats['org_count'] }}</div>
                <div style="font-size:.75rem;color:var(--text-muted)">With a credit wallet</div>
            </div>
        </div>
        <div class="col-6 col-lg-3">
            <div class="stat-card p-3">
                <div class="stat-label mb-1">Lifetime Consumed</div>
                <div class="stat-value">{{ number_format($stats['lifetime_consumed'], 0) }}</div>
                <div style="font-size:.75rem;color:var(--text-muted)">≈ ${{ number_format($stats['lifetime_consumed'] / $rate, 2) }}</div>
            </div>
        </div>
        <div class="col-6 col-lg-3">
            <div class="stat-card p-3">
                <div class="stat-label mb-1">Lifetime Top-ups</div>
                <div class="stat-value">{{ number_format($stats['lifetime_topped_up'], 0) }}</div>
                <div style="font-size:.75rem;color:var(--text-muted)">≈ ${{ number_format($stats['lifetime_topped_up'] / $rate, 2) }}</div>
            </div>
        </div>
        <div class="col-6 col-lg-3">
            <div class="stat-card p-3">
                <div class="stat-label mb-1">Outstanding Balance</div>
                <div class="stat-value">{{ number_format($stats['balance_outstanding'], 0) }}</div>
                <div style="font-size:.75rem;color:var(--text-muted)">Plan + top-up credits</div>
            </div>
        </div>
    </div>

    <div class="row g-3 mb-4">
        <div class="col-lg-5">
            <div class="metric-card p-4 h-100">
                <div class="section-label"><i class="bi bi-sliders"></i>Allocation Settings</div>

                <form action="{{ route('admin.map-credits.settings.update') }}" method="POST" class="row g-3">
                    @csrf

                    <div class="col-12">
                        <label class="form-label small fw-semibold">Allocation percentage of monthly plan</label>
                        <div class="input-group input-group-sm">
                            <input type="number" step="0.1" min="0" max="100" name="allocation_percent"
                                class="form-control" value="{{ old('allocation_percent', $settings['allocation_percent']) }}" required>
                            <span class="input-group-text">%</span>
                        </div>
                        <div style="font-size:.72rem;color:var(--text-muted)" class="mt-1">
                            e.g. 5% of a $99 plan = $4.95 = {{ number_format(99 * (old('allocation_percent', $settings['allocation_percent']) / 100) * $rate, 0) }} credits / cycle.
                        </div>
                    </div>

                    <div class="col-6">
                        <label class="form-label small fw-semibold">Credits per $1</label>
                        <input type="number" step="1" min="1" name="credits_per_usd" class="form-control form-control-sm"
                            value="{{ old('credits_per_usd', $settings['credits_per_usd']) }}" required>
                    </div>

                    <div class="col-6">
                        <label class="form-label small fw-semibold">Low balance threshold</label>
                        <div class="input-group input-group-sm">
                            <input type="number" step="1" min="0" max="100" name="low_threshold_percent"
                                class="form-control" value="{{ old('low_threshold_percent', $settings['low_threshold_percent']) }}" required>
                            <span class="input-group-text">%</span>
                        </div>
                    </div>

                    <div class="col-12">
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" id="enforce" name="enforce" value="1"
                                @checked(old('enforce', $settings['enforcement_enabled']))>
                            <label class="form-check-label small" for="enforce">
                                Enforce credits (hard-block Google calls once credits run out)
                            </label>
                        </div>
                    </div>

                    <div class="col-12">
                        <button type="submit" class="btn btn-primary btn-sm">
                            <i class="bi bi-check2-circle me-1"></i>Save settings
                        </button>
                    </div>

                    @if (!empty($settings['updated_at']))
                        <div class="col-12" style="font-size:.72rem;color:var(--text-muted)">
                            Last updated: {{ \Illuminate\Support\Carbon::parse($settings['updated_at'])->format('M j, Y g:i A') }}
                        </div>
                    @endif
                </form>
            </div>
        </div>

        <div class="col-lg-7">
            <div class="metric-card p-0 overflow-hidden h-100">
                <div class="d-flex align-items-center justify-content-between px-4 py-3" style="border-bottom:1px solid var(--border)">
                    <div class="section-label mb-0"><i class="bi bi-tags"></i>Per-call Credit Costs (SKUs)</div>
                    <a href="{{ route('admin.map-credits.skus.create') }}" class="btn btn-sm btn-outline-primary">
                        <i class="bi bi-plus-lg me-1"></i>New SKU
                    </a>
                </div>
                <div class="table-responsive">
                    <table class="table admin-table mb-0">
                        <thead>
                            <tr>
                                <th>SKU</th>
                                <th>Label</th>
                                <th>Credits / call</th>
                                <th>$ / 1k</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            @forelse ($skus as $sku)
                                <tr>
                                    <td class="fw-semibold">{{ $sku->sku }}</td>
                                    <td>{{ $sku->label }}</td>
                                    <td>{{ rtrim(rtrim(number_format((float) $sku->credit_cost, 4), '0'), '.') }}</td>
                                    <td>{{ $sku->usd_per_1k !== null ? '$' . number_format((float) $sku->usd_per_1k, 2) : '—' }}</td>
                                    <td>
                                        @if ($sku->is_active)
                                            <span class="badge-status badge-approved">Active</span>
                                        @else
                                            <span class="badge-status badge-inactive">Off</span>
                                        @endif
                                    </td>
                                    <td class="text-end">
                                        <div class="d-inline-flex gap-1">
                                            <a href="{{ route('admin.map-credits.skus.edit', $sku) }}" class="btn btn-sm btn-outline-secondary">
                                                <i class="bi bi-pencil"></i>
                                            </a>
                                            <form action="{{ route('admin.map-credits.skus.destroy', $sku) }}" method="POST"
                                                onsubmit="return confirm('Delete this SKU?');">
                                                @csrf @method('DELETE')
                                                <button type="submit" class="btn btn-sm btn-outline-danger"><i class="bi bi-trash"></i></button>
                                            </form>
                                        </div>
                                    </td>
                                </tr>
                            @empty
                                <tr>
                                    <td colspan="6" class="text-center py-4" style="color:var(--text-muted)">
                                        No SKUs configured. Falls back to built-in defaults.
                                    </td>
                                </tr>
                            @endforelse
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

    <div class="metric-card p-0 overflow-hidden">
        <div class="d-flex align-items-center justify-content-between px-4 py-3 gap-2 flex-wrap" style="border-bottom:1px solid var(--border)">
            <div class="section-label mb-0"><i class="bi bi-building"></i>Usage by Organization</div>
            <form action="{{ route('admin.map-credits.index') }}" method="GET" class="d-flex gap-2">
                <input type="search" name="q" value="{{ $search }}" class="form-control form-control-sm"
                    placeholder="Search organizations..." style="max-width:220px">
                <button type="submit" class="btn btn-sm btn-outline-secondary"><i class="bi bi-search"></i></button>
            </form>
        </div>

        <div class="table-responsive">
            <table class="table admin-table mb-0">
                <thead>
                    <tr>
                        <th>Organization</th>
                        <th>Plan</th>
                        <th>Allocation</th>
                        <th>Used / cycle</th>
                        <th>Plan left</th>
                        <th>Top-up</th>
                        <th>Balance</th>
                        <th>Lifetime</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    @forelse ($companies as $row)
                        @php $company = $row->company; @endphp
                        <tr>
                            <td>
                                <div class="fw-semibold">{{ $company?->name ?? 'Unknown' }}</div>
                                <div style="font-size:.72rem;color:var(--text-muted)">{{ $company?->company_id }}</div>
                            </td>
                            <td>{{ $company?->subscription_plan_key ?? '—' }}</td>
                            <td>{{ number_format((float) $row->allocation_credits, 0) }}</td>
                            <td>{{ number_format(max(0, (float) $row->allocation_credits - (float) $row->plan_credits), 0) }}</td>
                            <td>{{ number_format((float) $row->plan_credits, 0) }}</td>
                            <td>{{ number_format((float) $row->topup_credits, 0) }}</td>
                            <td class="fw-semibold">{{ number_format((float) $row->plan_credits + (float) $row->topup_credits, 0) }}</td>
                            <td>{{ number_format((float) $row->lifetime_consumed, 0) }}</td>
                            <td class="text-end">
                                @if ($company)
                                    <a href="{{ route('admin.map-credits.companies.show', $company) }}" class="btn btn-sm btn-outline-secondary">
                                        Details <i class="bi bi-arrow-right-short"></i>
                                    </a>
                                @endif
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="9" class="text-center py-4" style="color:var(--text-muted)">
                                No usage recorded yet.
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>

        @if ($companies->hasPages())
            <div class="px-4 py-3">{{ $companies->links() }}</div>
        @endif
    </div>
@endsection
