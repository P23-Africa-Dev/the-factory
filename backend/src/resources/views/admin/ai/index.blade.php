@extends('layouts.admin')

@section('title', 'AI Management')
@section('page-title', 'AI Management')

@section('breadcrumb')
    <li class="breadcrumb-item active">AI Management</li>
@endsection

@push('styles')
    <style>
        .ai-status-badge {
            display: inline-flex;
            align-items: center;
            gap: .45rem;
            padding: .45rem 1rem;
            border-radius: 2rem;
            font-size: .82rem;
            font-weight: 600;
        }

        .ai-status-online {
            background: rgba(16, 185, 129, .12);
            color: #059669;
        }

        .ai-status-offline {
            background: rgba(239, 68, 68, .12);
            color: #dc2626;
        }

        .ai-status-degraded {
            background: rgba(245, 158, 11, .12);
            color: #d97706;
        }

        .ai-status-fallback {
            background: rgba(59, 130, 246, .12);
            color: #2563eb;
        }

        .provider-tag {
            display: inline-flex;
            align-items: center;
            gap: .3rem;
            padding: .3rem .7rem;
            border-radius: .5rem;
            font-size: .8rem;
            font-weight: 600;
            border: 1px solid var(--border);
            background: var(--surface-hover);
        }

        .provider-tag.active {
            background: rgba(99, 102, 241, .1);
            border-color: var(--accent);
            color: var(--accent);
        }

        .model-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: .5rem 0;
            border-bottom: 1px solid var(--border-light);
            font-size: .85rem;
        }

        .model-row:last-child {
            border-bottom: 0;
        }

        .model-label {
            color: var(--text-secondary);
            font-size: .75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: .05em;
        }

        .model-value {
            font-weight: 600;
            font-family: 'Courier New', monospace;
            font-size: .8rem;
        }
    </style>
@endpush

@section('content')

    {{-- Header row --}}
    <div class="d-flex align-items-center justify-content-between mb-4">
        <div>
            <h4 class="fw-bold mb-1" style="font-size:1.1rem">AI Copilot Control Center</h4>
            <p class="mb-0" style="font-size:.82rem;color:var(--text-secondary)">Monitor and manage the Factory23 AI
                assistant infrastructure.</p>
        </div>
        <div class="d-flex gap-2">
            <a href="{{ route('admin.ai.analytics') }}" class="btn btn-sm btn-primary"><i
                    class="bi bi-bar-chart me-1"></i>Usage Analytics</a>
            <a href="{{ route('admin.ai.logs.index') }}" class="btn btn-sm btn-outline-secondary"><i
                    class="bi bi-journal-text me-1"></i>View Logs</a>
            <a href="{{ route('admin.ai.health') }}" target="_blank" class="btn btn-sm btn-outline-secondary"><i
                    class="bi bi-heart-pulse me-1"></i>Health JSON</a>
        </div>
    </div>

    {{-- AI Status banner --}}
    <div class="metric-card p-4 mb-4 d-flex align-items-center justify-content-between">
        <div class="d-flex align-items-center gap-3">
            <div
                style="width:48px;height:48px;border-radius:var(--radius);background:var(--accent-light);display:flex;align-items:center;justify-content:center;">
                <i class="bi bi-cpu" style="font-size:1.4rem;color:var(--accent)"></i>
            </div>
            <div>
                <div class="fw-bold" style="font-size:1rem">AI Assistant Status</div>
                <div style="font-size:.8rem;color:var(--text-secondary)">Real-time system health</div>
            </div>
        </div>
        <div class="d-flex align-items-center gap-3">
            @php
                $statusClass = match ($aiStatus) {
                    'online' => 'ai-status-online',
                    'offline' => 'ai-status-offline',
                    'degraded' => 'ai-status-degraded',
                    default => 'ai-status-fallback',
                };
                $statusIcon = match ($aiStatus) {
                    'online' => 'bi-check-circle-fill',
                    'offline' => 'bi-x-circle-fill',
                    'degraded' => 'bi-exclamation-triangle-fill',
                    default => 'bi-arrow-repeat',
                };
                $statusLabel = match ($aiStatus) {
                    'online' => 'Online',
                    'offline' => 'Offline',
                    'degraded' => 'Degraded',
                    default => 'Fallback Active',
                };
            @endphp
            <span class="ai-status-badge {{ $statusClass }}">
                <i class="bi {{ $statusIcon }}"></i> {{ $statusLabel }}
            </span>
            <div style="font-size:.8rem;color:var(--text-muted)">Last 24h error rate: <strong>{{ $errorRate }}%</strong>
            </div>
        </div>
    </div>

    {{-- Stats row --}}
    <div class="row g-3 mb-4">
        @php
            $cards = [
                [
                    'label' => 'Requests Today',
                    'value' => number_format($statsToday['total_requests']),
                    'icon' => 'bi-send',
                    'color' => '#6366f1',
                    'bg' => 'rgba(99,102,241,.08)',
                ],
                [
                    'label' => 'Requests (7 Days)',
                    'value' => number_format($statsWeek['total_requests']),
                    'icon' => 'bi-calendar3',
                    'color' => '#3b82f6',
                    'bg' => 'rgba(59,130,246,.08)',
                ],
                [
                    'label' => 'Requests (30 Days)',
                    'value' => number_format($statsMonth['total_requests']),
                    'icon' => 'bi-calendar-month',
                    'color' => '#8b5cf6',
                    'bg' => 'rgba(139,92,246,.08)',
                ],
                [
                    'label' => 'Success Rate (Today)',
                    'value' =>
                        $statsToday['total_requests'] > 0
                            ? round(($statsToday['successful'] / $statsToday['total_requests']) * 100, 1) . '%'
                            : 'N/A',
                    'icon' => 'bi-check2-circle',
                    'color' => '#10b981',
                    'bg' => 'rgba(16,185,129,.08)',
                ],
                [
                    'label' => 'Failed (Today)',
                    'value' => number_format($statsToday['failed']),
                    'icon' => 'bi-x-circle',
                    'color' => '#ef4444',
                    'bg' => 'rgba(239,68,68,.08)',
                ],
                [
                    'label' => 'Est. Cost (30 Days)',
                    'value' => '$' . number_format($statsMonth['estimated_cost_usd'], 4),
                    'icon' => 'bi-currency-dollar',
                    'color' => '#f59e0b',
                    'bg' => 'rgba(245,158,11,.08)',
                ],
            ];
        @endphp

        @foreach ($cards as $card)
            <div class="col-lg-2 col-md-4 col-6">
                <div class="stat-card p-3 h-100">
                    <div class="d-flex align-items-start justify-content-between mb-2">
                        <div class="stat-icon" style="background:{{ $card['bg'] }};color:{{ $card['color'] }}">
                            <i class="bi {{ $card['icon'] }}"></i>
                        </div>
                    </div>
                    <div class="stat-value" style="font-size:1.4rem">{{ $card['value'] }}</div>
                    <div class="stat-label mt-1">{{ $card['label'] }}</div>
                </div>
            </div>
        @endforeach
    </div>

    <div class="row g-3 mb-4">

        {{-- Providers & Models card --}}
        <div class="col-lg-4">
            <div class="metric-card p-4 h-100">
                <h6 class="fw-bold mb-3" style="font-size:.88rem">Active Providers</h6>

                <div class="d-flex gap-2 mb-4">
                    <span class="provider-tag {{ $openaiConfigured ? 'active' : '' }}">
                        <i class="bi bi-circle-fill" style="font-size:.5rem"></i>
                        OpenAI {{ $primaryProvider === 'openai' ? '(primary)' : '(fallback)' }}
                    </span>
                    <span class="provider-tag {{ $claudeConfigured ? 'active' : '' }}">
                        <i class="bi bi-circle-fill" style="font-size:.5rem"></i>
                        Claude {{ $fallbackProvider === 'claude' ? '(fallback)' : '(primary)' }}
                    </span>
                </div>

                <h6 class="fw-bold mb-2" style="font-size:.88rem">Configured Models</h6>
                <div>
                    <div class="model-row">
                        <span class="model-label">Default</span>
                        <span class="model-value">{{ config('services.ai.default_model') }}</span>
                    </div>
                    <div class="model-row">
                        <span class="model-label">Execution</span>
                        <span class="model-value">{{ config('services.ai.exec_model') }}</span>
                    </div>
                    <div class="model-row">
                        <span class="model-label">Analytics</span>
                        <span class="model-value">{{ config('services.ai.analyst_model') }}</span>
                    </div>
                    <div class="model-row">
                        <span class="model-label">Fallback</span>
                        <span class="model-value">{{ config('services.ai.fallback_provider') }}</span>
                    </div>
                </div>
            </div>
        </div>

        {{-- Feature Flags card --}}
        <div class="col-lg-4">
            <div class="metric-card p-4 h-100">
                <h6 class="fw-bold mb-3" style="font-size:.88rem">Feature Flags</h6>

                @php
                    $flags = [
                        [
                            'label' => 'Streaming',
                            'on' => config('services.ai.enable_streaming'),
                            'key' => 'AI_ENABLE_STREAMING',
                        ],
                        [
                            'label' => 'Actions',
                            'on' => config('services.ai.enable_actions'),
                            'key' => 'AI_ENABLE_ACTIONS',
                        ],
                        [
                            'label' => 'PII Redaction',
                            'on' => config('services.ai.pii_redaction_enabled'),
                            'key' => 'AI_PII_REDACTION_ENABLED',
                        ],
                        [
                            'label' => 'Credit Limit',
                            'on' => config('services.ai.monthly_org_credit_limit') > 0,
                            'key' => 'AI_MONTHLY_ORG_CREDIT_LIMIT',
                        ],
                    ];
                @endphp

                @foreach ($flags as $flag)
                    <div class="d-flex align-items-center justify-content-between py-2"
                        style="border-bottom:1px solid var(--border-light)">
                        <div>
                            <div style="font-size:.85rem;font-weight:500">{{ $flag['label'] }}</div>
                            <div style="font-size:.72rem;color:var(--text-muted);font-family:monospace">{{ $flag['key'] }}
                            </div>
                        </div>
                        @if ($flag['on'])
                            <span class="badge-status badge-active"><i class="bi bi-check-circle-fill"></i> On</span>
                        @else
                            <span class="badge-status badge-inactive"><i class="bi bi-dash-circle"></i> Off</span>
                        @endif
                    </div>
                @endforeach

                <div class="mt-3" style="font-size:.78rem;color:var(--text-muted)">
                    <i class="bi bi-info-circle me-1"></i>
                    Change these in <code>backend/src/.env</code> and run <code>config:clear</code>.
                </div>
            </div>
        </div>

        {{-- Token Usage card --}}
        <div class="col-lg-4">
            <div class="metric-card p-4 h-100">
                <h6 class="fw-bold mb-3" style="font-size:.88rem">Token Consumption (30 Days)</h6>

                <div class="d-flex flex-column gap-2">
                    @foreach (['openai' => 'OpenAI', 'claude' => 'Claude', 'none' => 'Blocked/Cancelled'] as $key => $label)
                        @if (isset($statsMonth['by_provider'][$key]))
                            @php $p = $statsMonth['by_provider'][$key]; @endphp
                            <div style="background:var(--surface-hover);border-radius:.5rem;padding:.65rem .85rem;">
                                <div class="d-flex justify-content-between mb-1" style="font-size:.82rem;font-weight:600">
                                    <span>{{ $label }}</span>
                                    <span>{{ number_format($p['tokens']) }} tokens</span>
                                </div>
                                <div class="d-flex justify-content-between"
                                    style="font-size:.75rem;color:var(--text-secondary)">
                                    <span>{{ number_format($p['requests']) }} requests</span>
                                    <span>${{ number_format($p['cost'], 4) }}</span>
                                </div>
                            </div>
                        @endif
                    @endforeach

                    @if (count($statsMonth['by_provider']) === 0)
                        <div class="text-center py-3" style="color:var(--text-muted);font-size:.85rem">
                            <i class="bi bi-inbox mb-2 d-block" style="font-size:1.5rem"></i>
                            No AI requests recorded in the last 30 days.
                        </div>
                    @endif
                </div>

                <div class="mt-3 pt-2" style="border-top:1px solid var(--border-light)">
                    <div class="d-flex justify-content-between" style="font-size:.85rem;font-weight:600">
                        <span>Total Est. Cost</span>
                        <span style="color:var(--accent)">${{ number_format($statsMonth['estimated_cost_usd'], 4) }}</span>
                    </div>
                </div>
            </div>
        </div>

    </div>

    {{-- Average response times --}}
    <div class="metric-card p-4">
        <div class="d-flex align-items-center justify-content-between mb-3">
            <h6 class="fw-bold mb-0" style="font-size:.88rem">Average Response Time (30 Days)</h6>
            <a href="{{ route('admin.ai.logs.index') }}" class="btn btn-sm btn-outline-secondary"
                style="font-size:.78rem">View All Logs</a>
        </div>
        <div class="row g-3">
            @foreach (['openai' => 'OpenAI', 'claude' => 'Claude'] as $key => $label)
                @php
                    use App\Models\AiLog;
                    $avgMs = AiLog::where('provider', $key)
                        ->where('created_at', '>=', now()->subDays(30))
                        ->avg('execution_ms');
                @endphp
                <div class="col-md-4">
                    <div style="background:var(--surface-hover);border-radius:.65rem;padding:1rem 1.25rem;">
                        <div
                            style="font-size:.75rem;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.35rem">
                            {{ $label }}</div>
                        <div style="font-size:1.6rem;font-weight:700;color:var(--text-primary)">
                            {{ $avgMs ? number_format((float) $avgMs) . 'ms' : 'N/A' }}
                        </div>
                    </div>
                </div>
            @endforeach
            <div class="col-md-4">
                <div style="background:var(--surface-hover);border-radius:.65rem;padding:1rem 1.25rem;">
                    <div
                        style="font-size:.75rem;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.35rem">
                        Overall (30d)</div>
                    <div style="font-size:1.6rem;font-weight:700;color:var(--text-primary)">
                        {{ $statsMonth['avg_execution_ms'] ? number_format((float) $statsMonth['avg_execution_ms']) . 'ms' : 'N/A' }}
                    </div>
                </div>
            </div>
        </div>
    </div>

@endsection
