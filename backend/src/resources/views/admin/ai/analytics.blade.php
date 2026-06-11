@extends('layouts.admin')

@section('title', 'AI Usage Analytics')
@section('page-title', 'AI Usage Analytics')

@section('breadcrumb')
    <li class="breadcrumb-item"><a href="{{ route('admin.ai.index') }}" class="text-decoration-none"
            style="color:var(--text-muted)">AI Management</a></li>
    <li class="breadcrumb-item active">Analytics</li>
@endsection

@push('styles')
    <style>
        .range-tab {
            padding: .4rem 1rem;
            border-radius: .5rem;
            font-size: .82rem;
            font-weight: 500;
            border: 1px solid var(--border);
            background: var(--surface-hover);
            color: var(--text-secondary);
            text-decoration: none;
            cursor: pointer;
            transition: .1s;
        }

        .range-tab.active {
            background: var(--accent);
            border-color: var(--accent);
            color: #fff;
        }

        .range-tab:hover:not(.active) {
            background: var(--surface);
            color: var(--text-primary);
        }

        .chart-container {
            position: relative;
            height: 220px;
        }
    </style>
@endpush

@section('content')

    <div class="d-flex align-items-center justify-content-between mb-4">
        <div>
            <h4 class="fw-bold mb-1" style="font-size:1.1rem">Usage Analytics</h4>
            <p class="mb-0" style="font-size:.82rem;color:var(--text-secondary)">Token consumption, cost, and request
                volumes.</p>
        </div>
        <div class="d-flex gap-1">
            @foreach (['1' => 'Today', '7' => '7d', '30' => '30d', '90' => '90d', '365' => '1y'] as $r => $label)
                <a href="{{ route('admin.ai.analytics', ['range' => $r]) }}"
                    class="range-tab {{ $range == $r ? 'active' : '' }}">{{ $label }}</a>
            @endforeach
        </div>
    </div>

    {{-- Summary Stats --}}
    <div class="row g-3 mb-4">
        @php
            $cards = [
                [
                    'label' => 'Total Requests',
                    'value' => number_format($stats['total_requests']),
                    'icon' => 'bi-send',
                    'color' => '#6366f1',
                    'bg' => 'rgba(99,102,241,.08)',
                ],
                [
                    'label' => 'Successful',
                    'value' => number_format($stats['successful']),
                    'icon' => 'bi-check-circle',
                    'color' => '#10b981',
                    'bg' => 'rgba(16,185,129,.08)',
                ],
                [
                    'label' => 'Failed',
                    'value' => number_format($stats['failed']),
                    'icon' => 'bi-x-circle',
                    'color' => '#ef4444',
                    'bg' => 'rgba(239,68,68,.08)',
                ],
                [
                    'label' => 'Total Tokens',
                    'value' => number_format($stats['total_tokens']),
                    'icon' => 'bi-lightning',
                    'color' => '#f59e0b',
                    'bg' => 'rgba(245,158,11,.08)',
                ],
                [
                    'label' => 'Input Tokens',
                    'value' => number_format($stats['input_tokens']),
                    'icon' => 'bi-arrow-right-circle',
                    'color' => '#3b82f6',
                    'bg' => 'rgba(59,130,246,.08)',
                ],
                [
                    'label' => 'Output Tokens',
                    'value' => number_format($stats['output_tokens']),
                    'icon' => 'bi-arrow-left-circle',
                    'color' => '#8b5cf6',
                    'bg' => 'rgba(139,92,246,.08)',
                ],
                [
                    'label' => 'Est. Cost (USD)',
                    'value' => '$' . number_format($stats['estimated_cost_usd'], 4),
                    'icon' => 'bi-currency-dollar',
                    'color' => '#10b981',
                    'bg' => 'rgba(16,185,129,.08)',
                ],
                [
                    'label' => 'Avg Response',
                    'value' => $stats['avg_execution_ms']
                        ? number_format((float) $stats['avg_execution_ms']) . 'ms'
                        : 'N/A',
                    'icon' => 'bi-stopwatch',
                    'color' => '#6366f1',
                    'bg' => 'rgba(99,102,241,.08)',
                ],
            ];
        @endphp
        @foreach ($cards as $c)
            <div class="col-lg-3 col-md-4 col-6">
                <div class="stat-card p-3 h-100">
                    <div class="d-flex align-items-start justify-content-between mb-2">
                        <div class="stat-icon" style="background:{{ $c['bg'] }};color:{{ $c['color'] }}"><i
                                class="bi {{ $c['icon'] }}"></i></div>
                    </div>
                    <div class="stat-value" style="font-size:1.35rem">{{ $c['value'] }}</div>
                    <div class="stat-label mt-1">{{ $c['label'] }}</div>
                </div>
            </div>
        @endforeach
    </div>

    {{-- Charts --}}
    <div class="row g-3 mb-4">
        <div class="col-lg-8">
            <div class="metric-card p-4">
                <h6 class="fw-bold mb-3" style="font-size:.88rem">Daily Request Volume</h6>
                <div class="chart-container">
                    <canvas id="requestChart"></canvas>
                </div>
            </div>
        </div>
        <div class="col-lg-4">
            <div class="metric-card p-4">
                <h6 class="fw-bold mb-3" style="font-size:.88rem">By Provider</h6>
                @foreach ($stats['by_provider'] as $provider => $data)
                    <div style="margin-bottom:1rem">
                        <div class="d-flex justify-content-between mb-1" style="font-size:.82rem;font-weight:600">
                            <span class="text-capitalize">{{ $provider }}</span>
                            <span>{{ number_format($data['requests']) }} req</span>
                        </div>
                        @php $pct = $stats['total_requests'] > 0 ? round(($data['requests'] / $stats['total_requests']) * 100) : 0; @endphp
                        <div style="height:6px;background:var(--border-light);border-radius:3px;">
                            <div style="height:100%;background:var(--accent);border-radius:3px;width:{{ $pct }}%">
                            </div>
                        </div>
                        <div class="d-flex justify-content-between mt-1" style="font-size:.72rem;color:var(--text-muted)">
                            <span>{{ number_format($data['tokens']) }} tokens</span>
                            <span>${{ number_format($data['cost'], 4) }}</span>
                        </div>
                    </div>
                @endforeach
                @if (empty($stats['by_provider']))
                    <div class="text-center py-3" style="color:var(--text-muted);font-size:.85rem">No data for this period.
                    </div>
                @endif
            </div>
        </div>
    </div>

    {{-- Daily table --}}
    <div class="metric-card">
        <div class="table-card-header">
            <span class="fw-bold" style="font-size:.88rem">Daily Breakdown</span>
        </div>
        <div class="table-responsive">
            <table class="table admin-table mb-0">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Requests</th>
                        <th>Tokens</th>
                        <th>Est. Cost (USD)</th>
                    </tr>
                </thead>
                <tbody>
                    @forelse(array_reverse($days, true) as $day => $d)
                        <tr>
                            <td>{{ $day }}</td>
                            <td>{{ number_format($d['requests']) }}</td>
                            <td>{{ number_format($d['tokens']) }}</td>
                            <td>${{ number_format($d['cost'], 4) }}</td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="4" class="text-center py-4" style="color:var(--text-muted)">No data for this
                                period.</td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>
    </div>

@endsection

@push('scripts')
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <script>
        (function() {
            const labels = {!! json_encode(array_keys($days)) !!};
            const requests = {!! json_encode(array_column(array_values($days), 'requests')) !!};
            const costs = {!! json_encode(array_column(array_values($days), 'cost')) !!};

            new Chart(document.getElementById('requestChart'), {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Requests',
                        data: requests,
                        backgroundColor: 'rgba(99,102,241,.7)',
                        borderRadius: 4,
                        borderSkipped: false,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        x: {
                            grid: {
                                display: false
                            },
                            ticks: {
                                font: {
                                    size: 10
                                },
                                maxTicksLimit: 14
                            }
                        },
                        y: {
                            grid: {
                                color: 'rgba(0,0,0,.05)'
                            },
                            ticks: {
                                font: {
                                    size: 11
                                }
                            },
                            beginAtZero: true
                        }
                    }
                }
            });
        })();
    </script>
@endpush
