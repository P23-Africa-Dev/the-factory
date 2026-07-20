@extends('layouts.admin')

@section('title', 'AI Management')
@section('page-title', 'AI Management')

@section('breadcrumb')
    <li class="breadcrumb-item active">AI Management</li>
@endsection

@push('styles')
    <style>
        .ai-ops-page {
            width: 100%;
            max-width: 100%;
            min-width: 0;
        }

        .ai-ops-header {
            gap: 1rem;
        }

        .ai-ops-header-actions {
            flex-shrink: 0;
        }

        .ai-status-panel {
            gap: 1rem;
        }

        .ai-status-panel-metrics {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: .75rem 1.25rem;
            min-width: 0;
        }

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

        .provider-health-card {
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 1.25rem;
            height: 100%;
            background: var(--surface);
        }

        .provider-health-card.status-connected {
            border-left: 4px solid var(--success);
        }

        .provider-health-card.status-warning {
            border-left: 4px solid var(--warning);
        }

        .provider-health-card.status-error {
            border-left: 4px solid var(--danger);
        }

        .health-pill {
            display: inline-flex;
            align-items: center;
            gap: .35rem;
            padding: .25rem .65rem;
            border-radius: 2rem;
            font-size: .75rem;
            font-weight: 600;
        }

        .health-pill.connected {
            background: rgba(16, 185, 129, .12);
            color: #059669;
        }

        .health-pill.warning {
            background: rgba(245, 158, 11, .12);
            color: #d97706;
        }

        .health-pill.error {
            background: rgba(239, 68, 68, .12);
            color: #dc2626;
        }

        .chart-container-sm {
            position: relative;
            height: 200px;
            max-width: 100%;
        }

        .chart-container-sm canvas {
            max-width: 100% !important;
        }

        @media (max-width: 767.98px) {
            .ai-ops-header {
                flex-direction: column;
                align-items: flex-start !important;
            }

            .ai-ops-header-actions {
                width: 100%;
                flex-wrap: wrap;
            }
        }

        .test-result-box {
            font-size: .78rem;
            border-radius: .5rem;
            padding: .65rem .85rem;
            margin-top: .75rem;
            display: none;
        }
    </style>
@endpush

@section('content')
@php
    $activeStackLabel = match ($activeAiStack) {
        'nvidia' => 'NVIDIA NIM',
        'glm' => 'GLM (Zhipu)',
        default => 'OpenAI + Claude',
    };
    $activeStackShortLabel = match ($activeAiStack) {
        'nvidia' => 'NVIDIA',
        'glm' => 'GLM',
        default => 'OpenAI + Claude',
    };
@endphp
<div class="page-container ai-ops-page">
    @if (!$aiLogsReady)
        <div class="alert alert-warning mb-4" role="alert">
            <i class="bi bi-exclamation-triangle me-2"></i>
            AI logs storage is not available yet. Run migrations to enable full AI analytics.
        </div>
    @endif

    <div id="ai-warning-banners">
    @foreach ($warningBanners as $banner)
        <div class="alert alert-{{ $banner['severity'] === 'danger' ? 'danger' : 'warning' }} mb-3 ai-provider-warning"
            role="alert" data-provider="{{ $banner['provider'] ?? '' }}">
            <i class="bi bi-exclamation-triangle-fill me-2"></i>{{ $banner['message'] }}
        </div>
    @endforeach
    </div>

    @foreach ($activeAlerts as $alert)
        <div class="alert alert-{{ $alert->severity === 'critical' ? 'danger' : 'warning' }} mb-3 d-flex align-items-center justify-content-between"
            role="alert">
            <div>
                <strong>{{ $alert->title }}</strong>
                <div style="font-size:.82rem">{{ $alert->message }}</div>
            </div>
            <form method="POST" action="{{ route('admin.ai.alerts.resolve', $alert) }}" class="ms-3">
                @csrf
                <button type="submit" class="btn btn-sm btn-outline-secondary">Dismiss</button>
            </form>
        </div>
    @endforeach

    {{-- Header row --}}
    <div class="d-flex align-items-center justify-content-between mb-4 ai-ops-header flex-wrap">
        <div class="min-w-0">
            <h4 class="fw-bold mb-1" style="font-size:1.1rem">AI Operations Center</h4>
            <p class="mb-0" style="font-size:.82rem;color:var(--text-secondary)">Monitor providers, usage, health, and
                troubleshoot ELY AI infrastructure.</p>
        </div>
        <div class="d-flex gap-2 ai-ops-header-actions flex-wrap">
            <a href="{{ route('admin.ai.analytics') }}" class="btn btn-sm btn-primary"><i
                    class="bi bi-bar-chart me-1"></i>Usage Analytics</a>
            <a href="{{ route('admin.ai.logs.index') }}" class="btn btn-sm btn-outline-secondary"><i
                    class="bi bi-journal-text me-1"></i>View Logs</a>
            <a href="{{ route('admin.ai.health') }}" target="_blank" class="btn btn-sm btn-outline-secondary"><i
                    class="bi bi-heart-pulse me-1"></i>Health JSON</a>
        </div>
    </div>

    {{-- AI stack switch (super_admin) --}}
    <div class="metric-card p-4 mb-4">
        <div class="d-flex align-items-start justify-content-between flex-wrap gap-3 mb-3">
            <div>
                <h6 class="fw-bold mb-1" style="font-size:.9rem">ELY AI Stack</h6>
                <p class="mb-0" style="font-size:.8rem;color:var(--text-secondary)">
                    Active stack: <strong>{{ $activeStackLabel }}</strong>.
                    Switching completely stops calls (and vendor token usage) on the inactive stack.
                </p>
            </div>
            @if (! $canManageAiStack)
                <span class="badge text-bg-light border" style="font-size:.75rem">Super admin only</span>
            @endif
        </div>

        @if ($canManageAiStack)
            <form method="POST" action="{{ route('admin.ai.stack.update') }}" class="row g-3 align-items-stretch">
                @csrf
                <div class="col-md-4">
                    <input type="radio" class="btn-check" name="stack" id="ai-stack-openai-claude" value="openai_claude"
                        {{ $activeAiStack === 'openai_claude' ? 'checked' : '' }}>
                    <label class="btn btn-outline-secondary w-100 text-start p-3 h-100" for="ai-stack-openai-claude">
                        <div class="fw-bold mb-1">OpenAI + Claude</div>
                        <div style="font-size:.78rem;color:var(--text-secondary)">
                            Operational/routing on OpenAI; analyst/report on Claude, with in-stack failover.
                        </div>
                    </label>
                </div>
                <div class="col-md-4">
                    <input type="radio" class="btn-check" name="stack" id="ai-stack-nvidia" value="nvidia"
                        {{ $activeAiStack === 'nvidia' ? 'checked' : '' }}>
                    <label class="btn btn-outline-secondary w-100 text-start p-3 h-100" for="ai-stack-nvidia">
                        <div class="fw-bold mb-1">NVIDIA NIM</div>
                        <div style="font-size:.78rem;color:var(--text-secondary)">
                            Routing: {{ $aiStackSnapshot['nvidia_models']['routing'] ?? '—' }}<br>
                            Chat: {{ $aiStackSnapshot['nvidia_models']['exec'] ?? '—' }}<br>
                            Analyst: {{ $aiStackSnapshot['nvidia_models']['analyst'] ?? '—' }}
                        </div>
                    </label>
                </div>
                <div class="col-md-4">
                    <input type="radio" class="btn-check" name="stack" id="ai-stack-glm" value="glm"
                        {{ $activeAiStack === 'glm' ? 'checked' : '' }}>
                    <label class="btn btn-outline-secondary w-100 text-start p-3 h-100" for="ai-stack-glm">
                        <div class="fw-bold mb-1">GLM (Zhipu)</div>
                        <div style="font-size:.78rem;color:var(--text-secondary)">
                            Routing: {{ $aiStackSnapshot['glm_models']['routing'] ?? '—' }}<br>
                            Chat: {{ $aiStackSnapshot['glm_models']['exec'] ?? '—' }}<br>
                            Analyst: {{ $aiStackSnapshot['glm_models']['analyst'] ?? '—' }}
                        </div>
                    </label>
                </div>
                <div class="col-12 d-flex justify-content-end">
                    <button type="submit" class="btn btn-primary px-4">Apply stack</button>
                </div>
            </form>
            <div class="mt-3" style="font-size:.78rem;color:var(--text-muted)">
                GLM key: <strong>{{ $glmConfigured ? 'configured' : 'missing' }}</strong>
                · NVIDIA key: <strong>{{ $nvidiaConfigured ? 'configured' : 'missing' }}</strong>
                · OpenAI key: <strong>{{ $openaiConfigured ? 'configured' : 'missing' }}</strong>
                · Claude key: <strong>{{ $claudeConfigured ? 'configured' : 'missing' }}</strong>
            </div>
            <div class="mt-2 alert alert-warning mb-0 py-2 px-3" style="font-size:.78rem">
                Hosted NVIDIA NIM (API catalog) can be slow or hang under load — that is NVIDIA-side contention, not a Factory23 outage.
                Intent routing fails fast (~15s) so ELY can fall back to rules; chat waits up to ~60s.
                After a timeout, NVIDIA is briefly skipped so the next turn does not hang again.
                For production latency, use paid/self-hosted NIM, or keep OpenAI + Claude for snappy Ask ELY.
            </div>
        @else
            <div style="font-size:.82rem;color:var(--text-secondary)">
                Ask a super admin to switch stacks. Current NVIDIA key status:
                <strong>{{ $nvidiaConfigured ? 'configured' : 'missing' }}</strong>.
            </div>
        @endif
    </div>

    {{-- Real-time status widget --}}
    <div class="metric-card p-4 mb-4 ai-status-panel d-flex align-items-center justify-content-between flex-wrap">
        <div class="d-flex align-items-center gap-3">
            <div
                style="width:48px;height:48px;border-radius:var(--radius);background:var(--accent-light);display:flex;align-items:center;justify-content:center;">
                <i class="bi bi-cpu" style="font-size:1.4rem;color:var(--accent)"></i>
            </div>
            <div>
                <div class="fw-bold" style="font-size:1rem">Real-Time AI Status</div>
                <div style="font-size:.8rem;color:var(--text-secondary)">
                    Active provider: <strong id="ai-active-provider-label">{{ $activeProviderLabel }}</strong>
                    · Stack: <strong>{{ $activeStackShortLabel }}</strong>
                </div>
            </div>
        </div>
        <div class="d-flex align-items-center gap-4 flex-wrap ai-status-panel-metrics">
            <div style="font-size:.82rem">
                <span class="me-3">OpenAI:
                    <strong id="realtime-status-openai">{{ $openaiHealth['label'] ?? (($openaiHealth['ok'] ?? false) ? 'Connected' : 'Unavailable') }}</strong></span>
                <span class="me-3">Claude:
                    <strong id="realtime-status-claude">{{ $claudeHealth['label'] ?? (($claudeHealth['ok'] ?? false) ? 'Connected' : 'Unavailable') }}</strong></span>
                <span>NVIDIA:
                    <strong id="realtime-status-nvidia">{{ $nvidiaHealth['label'] ?? (($nvidiaHealth['ok'] ?? false) ? 'Connected' : 'Unavailable') }}</strong></span>
                <span class="ms-3">GLM:
                    <strong id="realtime-status-glm">{{ $glmHealth['label'] ?? (($glmHealth['ok'] ?? false) ? 'Connected' : 'Unavailable') }}</strong></span>
            </div>
            <span class="ai-status-badge {{ $aggregateStatus['class'] }}" id="ai-aggregate-status-badge">
                <i class="bi {{ $aggregateStatus['icon'] }}" id="ai-aggregate-status-icon"></i>
                <span id="ai-aggregate-status-label">{{ $aggregateStatus['label'] }}</span>
            </span>
            <div style="font-size:.8rem;color:var(--text-muted)">
                LLM calls today: <strong>{{ number_format($statsToday['total_requests']) }}</strong> ·
                Month: <strong>{{ number_format($statsMonth['total_requests']) }}</strong> ·
                Est. cost: <strong>${{ number_format($statsMonth['estimated_cost_usd'], 2) }}</strong>
            </div>
            <div style="font-size:.8rem;color:var(--text-muted)">24h LLM error rate: <strong>{{ $errorRate }}%</strong></div>
        </div>
    </div>

    {{-- Provider health cards --}}
    <div class="row g-3 mb-4">
        @foreach ([
            'openai' => ['label' => 'OpenAI', 'health' => $openaiHealth],
            'claude' => ['label' => 'Claude (Anthropic)', 'health' => $claudeHealth],
            'nvidia' => ['label' => 'NVIDIA NIM', 'health' => $nvidiaHealth],
            'glm' => ['label' => 'GLM (Zhipu)', 'health' => $glmHealth],
        ] as $key => $item)
            @php
                $health = $item['health'];
                $usage = $providerUsage[$key] ?? [];
                $presentation = app(\App\Services\AI\Admin\AiProviderHealthService::class)->presentation($health);
                $isActiveStackVendor = ($activeAiStack === 'nvidia' && $key === 'nvidia')
                    || ($activeAiStack === 'glm' && $key === 'glm')
                    || ($activeAiStack === 'openai_claude' && in_array($key, ['openai', 'claude'], true));
            @endphp
            <div class="col-lg-3">
                <div class="provider-health-card {{ $presentation['card_class'] }}" id="provider-card-{{ $key }}">
                    <div class="d-flex align-items-center justify-content-between mb-3">
                        <h6 class="fw-bold mb-0" style="font-size:.9rem">
                            {{ $item['label'] }}
                            @if ($isActiveStackVendor)
                                <span class="badge text-bg-primary ms-1" style="font-size:.65rem">active stack</span>
                            @else
                                <span class="badge text-bg-light border ms-1" style="font-size:.65rem">idle</span>
                            @endif
                        </h6>
                        <span class="health-pill {{ $presentation['pill_class'] }}" id="provider-pill-{{ $key }}">{{ $presentation['label'] }}</span>
                    </div>
                    <div class="row g-2 mb-3" style="font-size:.78rem">
                        <div class="col-6">
                            <div style="color:var(--text-muted)">Last Successful Check</div>
                            <div class="fw-600">
                                {{ isset($health['last_success_at']) ? \Illuminate\Support\Carbon::parse($health['last_success_at'])->format('Y-m-d H:i:s') : '—' }}
                            </div>
                        </div>
                        <div class="col-6">
                            <div style="color:var(--text-muted)">Last Failed Check</div>
                            <div class="fw-600">
                                {{ isset($health['last_failed_at']) ? \Illuminate\Support\Carbon::parse($health['last_failed_at'])->format('Y-m-d H:i:s') : '—' }}
                            </div>
                        </div>
                        <div class="col-6">
                            <div style="color:var(--text-muted)">Response Time</div>
                            <div class="fw-600">{{ isset($health['latency_ms']) ? $health['latency_ms'] . 'ms' : '—' }}
                            </div>
                        </div>
                        <div class="col-6">
                            <div style="color:var(--text-muted)">Status Message</div>
                            <div id="provider-message-{{ $key }}">{{ $presentation['message'] !== '' ? $presentation['message'] : '—' }}</div>
                        </div>
                    </div>
                    <div style="background:var(--surface-hover);border-radius:.5rem;padding:.75rem;margin-bottom:.75rem;font-size:.78rem">
                        <div class="row g-2">
                            <div class="col-4"><span style="color:var(--text-muted)">LLM Today</span><br><strong>{{ number_format($usage['requests_today'] ?? 0) }}</strong></div>
                            <div class="col-4"><span style="color:var(--text-muted)">LLM Month</span><br><strong>{{ number_format($usage['requests_month'] ?? 0) }}</strong></div>
                            <div class="col-4"><span style="color:var(--text-muted)">Est. Cost</span><br><strong>${{ number_format($usage['estimated_cost_usd'] ?? 0, 4) }}</strong></div>
                            <div class="col-4"><span style="color:var(--text-muted)">Input Tokens</span><br><strong>{{ number_format($usage['input_tokens'] ?? 0) }}</strong></div>
                            <div class="col-4"><span style="color:var(--text-muted)">Output Tokens</span><br><strong>{{ number_format($usage['output_tokens'] ?? 0) }}</strong></div>
                            <div class="col-4"><span style="color:var(--text-muted)">Total Tokens</span><br><strong>{{ number_format($usage['total_tokens'] ?? 0) }}</strong></div>
                        </div>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-primary test-provider-btn"
                        data-provider="{{ $key }}">
                        <i class="bi bi-plug me-1"></i>Test LLM Access
                    </button>
                    <div class="test-result-box" id="test-result-{{ $key }}"></div>
                </div>
            </div>
        @endforeach
    </div>

    {{-- Failover visibility --}}
    <div class="metric-card p-4 mb-4">
        <h6 class="fw-bold mb-3" style="font-size:.88rem">Provider Routing & Failover</h6>
        <div class="row g-3">
            <div class="col-md-3">
                <div style="font-size:.75rem;color:var(--text-muted)">Active Stack</div>
                <div class="fw-bold">{{ $activeStackLabel }}</div>
            </div>
            <div class="col-md-3">
                <div style="font-size:.75rem;color:var(--text-muted)">Default Provider</div>
                <div class="fw-bold text-capitalize">{{ in_array($activeAiStack, ['nvidia', 'glm'], true) ? $activeAiStack : $primaryProvider }}</div>
            </div>
            <div class="col-md-3">
                <div style="font-size:.75rem;color:var(--text-muted)">Fallback Provider</div>
                <div class="fw-bold text-capitalize">{{ in_array($activeAiStack, ['nvidia', 'glm'], true) ? 'none (hard switch)' : $fallbackProvider }}</div>
            </div>
            <div class="col-md-3">
                <div style="font-size:.75rem;color:var(--text-muted)">Last Automatic Failover</div>
                @if ($lastFailover)
                    <div class="fw-bold">{{ $lastFailover['message'] ?? '—' }}</div>
                    <div style="font-size:.78rem;color:var(--text-muted)">
                        {{ isset($lastFailover['occurred_at']) ? \Illuminate\Support\Carbon::parse($lastFailover['occurred_at'])->format('M j, Y g:i A') : '' }}
                    </div>
                @else
                    <div style="color:var(--text-muted);font-size:.85rem">No automatic failover recorded.</div>
                @endif
            </div>
        </div>
    </div>

    {{-- Usage analytics: users, orgs, models --}}
    @if ($aiLogsReady)
        <div class="row g-3 mb-4">
            <div class="col-lg-4">
                <div class="metric-card p-4 h-100">
                    <h6 class="fw-bold mb-3" style="font-size:.88rem">Most Active Users (30d)</h6>
                    @forelse($topUsers as $user)
                        <div class="d-flex justify-content-between py-2" style="border-bottom:1px solid var(--border-light);font-size:.82rem">
                            <div>
                                <div class="fw-500">{{ $user['name'] }}</div>
                                <div style="font-size:.72rem;color:var(--text-muted)">{{ $user['email'] }}</div>
                            </div>
                            <strong>{{ number_format($user['requests']) }}</strong>
                        </div>
                    @empty
                        <div class="text-muted" style="font-size:.85rem">No user activity yet.</div>
                    @endforelse
                </div>
            </div>
            <div class="col-lg-4">
                <div class="metric-card p-4 h-100">
                    <h6 class="fw-bold mb-3" style="font-size:.88rem">Most Active Organizations (30d)</h6>
                    @forelse($topOrganizations as $org)
                        <div class="d-flex justify-content-between py-2" style="border-bottom:1px solid var(--border-light);font-size:.82rem">
                            <span>{{ $org['name'] }}</span>
                            <strong>{{ number_format($org['requests']) }}</strong>
                        </div>
                    @empty
                        <div class="text-muted" style="font-size:.85rem">No organization activity yet.</div>
                    @endforelse
                </div>
            </div>
            <div class="col-lg-4">
                <div class="metric-card p-4 h-100">
                    <h6 class="fw-bold mb-3" style="font-size:.88rem">Model Usage (30d)</h6>
                    @forelse($modelUsageDetailed as $model)
                        <div class="mb-2">
                            <div class="d-flex justify-content-between mb-1" style="font-size:.82rem;font-weight:600">
                                <span style="font-family:monospace;font-size:.72rem">{{ $model['label'] }}</span>
                                <span>{{ $model['percentage'] }}%</span>
                            </div>
                            <div style="height:5px;background:var(--border-light);border-radius:3px;">
                                <div style="height:100%;background:var(--accent);border-radius:3px;width:{{ $model['percentage'] }}%"></div>
                            </div>
                            <div class="d-flex justify-content-between mt-1" style="font-size:.7rem;color:var(--text-muted)">
                                <span>{{ number_format($model['requests']) }} req</span>
                                <span>{{ number_format($model['tokens']) }} tok · ${{ number_format($model['cost'], 4) }}</span>
                            </div>
                        </div>
                    @empty
                        <div class="text-muted" style="font-size:.85rem">No model usage data.</div>
                    @endforelse
                </div>
            </div>
        </div>

        {{-- Usage trend charts --}}
        <div class="row g-3 mb-4">
            <div class="col-lg-6">
                <div class="metric-card p-4">
                    <h6 class="fw-bold mb-3" style="font-size:.88rem">Daily Requests (30 Days)</h6>
                    <div class="chart-container-sm"><canvas id="dailyRequestsChart"></canvas></div>
                </div>
            </div>
            <div class="col-lg-6">
                <div class="metric-card p-4">
                    <h6 class="fw-bold mb-3" style="font-size:.88rem">Daily Token Consumption (30 Days)</h6>
                    <div class="chart-container-sm"><canvas id="dailyTokensChart"></canvas></div>
                </div>
            </div>
            <div class="col-lg-6">
                <div class="metric-card p-4">
                    <h6 class="fw-bold mb-3" style="font-size:.88rem">Provider Distribution</h6>
                    <div class="chart-container-sm"><canvas id="providerDistChart"></canvas></div>
                </div>
            </div>
            <div class="col-lg-6">
                <div class="metric-card p-4">
                    <h6 class="fw-bold mb-3" style="font-size:.88rem">Success vs Failed Requests (30 Days)</h6>
                    <div class="chart-container-sm"><canvas id="successRateChart"></canvas></div>
                </div>
            </div>
        </div>

        {{-- Error monitoring --}}
        <div class="metric-card mb-4">
            <div class="table-card-header">
                <span class="fw-bold" style="font-size:.88rem">AI Error Monitoring</span>
                <a href="{{ route('admin.ai.logs.index', ['status' => 'failed']) }}" class="btn btn-sm btn-outline-secondary">View All Errors</a>
            </div>
            <div class="table-responsive">
                <table class="table admin-table mb-0">
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Error</th>
                            <th>Provider</th>
                            <th>User</th>
                            <th>Status</th>
                            <th>Resolution</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse($recentErrors as $error)
                            <tr>
                                <td style="font-size:.78rem;white-space:nowrap">{{ isset($error['occurred_at']) ? \Illuminate\Support\Carbon::parse($error['occurred_at'])->format('M j, H:i:s') : '—' }}</td>
                                <td style="font-size:.78rem;max-width:280px">{{ \Illuminate\Support\Str::limit($error['message'], 80) }}</td>
                                <td style="font-size:.78rem" class="text-capitalize">{{ $error['provider'] }}</td>
                                <td style="font-size:.78rem">{{ $error['user'] ?? '—' }}</td>
                                <td><span class="badge-status badge-rejected">{{ ucfirst($error['status']) }}</span></td>
                                <td style="font-size:.78rem">{{ ucfirst($error['resolution']) }}</td>
                                <td><a href="{{ $error['log_url'] }}" class="btn btn-sm btn-outline-secondary"><i class="bi bi-eye"></i></a></td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="7" class="text-center py-4" style="color:var(--text-muted)">No recent errors.</td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>

        {{-- Recent activity logs --}}
        <div class="metric-card mb-4">
            <div class="table-card-header">
                <span class="fw-bold" style="font-size:.88rem">Recent LLM Invocations</span>
                <a href="{{ route('admin.ai.logs.index') }}" class="btn btn-sm btn-outline-secondary">Full Logs</a>
            </div>
            <div class="table-responsive">
                <table class="table admin-table mb-0">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>User</th>
                            <th>Organization</th>
                            <th>Provider</th>
                            <th>Model</th>
                            <th>Prompt Type</th>
                            <th>Tool</th>
                            <th>Status</th>
                            <th>Exec</th>
                            <th>Tokens</th>
                            <th>Cost</th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse($recentLogs as $log)
                            <tr>
                                <td style="font-size:.78rem">{{ $log->created_at?->format('M j, H:i:s') }}</td>
                                <td style="font-size:.78rem">{{ $log->user?->name ?? '—' }}</td>
                                <td style="font-size:.78rem">{{ $log->company?->name ?? '—' }}</td>
                                <td style="font-size:.78rem" class="text-capitalize">{{ $log->provider }}</td>
                                <td style="font-size:.72rem;font-family:monospace">{{ $log->model }}</td>
                                <td style="font-size:.78rem">{{ $log->intent_type ?? '—' }}</td>
                                <td style="font-size:.72rem">{{ $log->tool_name ?? '—' }}</td>
                                <td><span class="badge-status {{ $log->status === 'success' ? 'badge-active' : 'badge-rejected' }}">{{ ucfirst($log->status) }}</span></td>
                                <td style="font-size:.78rem">{{ $log->execution_ms ? $log->execution_ms . 'ms' : '—' }}</td>
                                <td style="font-size:.78rem">{{ $log->total_tokens ? number_format($log->total_tokens) : '—' }}</td>
                                <td style="font-size:.78rem">${{ number_format((float) ($log->estimated_cost_usd ?? 0), 4) }}</td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="11" class="text-center py-4" style="color:var(--text-muted)">No recent activity.</td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>
    @endif

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
                        <span class="model-label">OpenAI Model</span>
                        <span class="model-value">{{ config('services.ai.openai.model') }}
                            @if (($openaiHealth['resolved_model'] ?? null))
                                → {{ $openaiHealth['resolved_model'] }}
                            @endif
                        </span>
                    </div>
                        <div class="model-row">
                            <span class="model-label">Claude Model</span>
                            <span class="model-value">{{ config('services.ai.claude.model') }}
                                @if (($claudeHealth['resolved_model'] ?? null))
                                    → {{ $claudeHealth['resolved_model'] }}
                                @endif
                            </span>
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
                    @foreach (['openai' => 'OpenAI', 'claude' => 'Claude', 'nvidia' => 'NVIDIA', 'none' => 'Blocked/Cancelled'] as $key => $label)
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
                        <span
                            style="color:var(--accent)">${{ number_format($statsMonth['estimated_cost_usd'], 4) }}</span>
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
                @php $avgMs = $avgExecutionByProvider[$key] ?? null; @endphp
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

</div>{{-- /.page-container.ai-ops-page --}}

@endsection

@push('scripts')
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <script>
        window.__aiProviderHealth = {
            openai: @json($openaiHealth),
            claude: @json($claudeHealth),
            nvidia: @json($nvidiaHealth),
            glm: @json($glmHealth),
        };
        window.__aiProviderConfig = {
            openaiConfigured: @json($openaiConfigured),
            claudeConfigured: @json($claudeConfigured),
            nvidiaConfigured: @json($nvidiaConfigured),
            glmConfigured: @json($glmConfigured),
            primaryProvider: @json($primaryProvider),
            fallbackProvider: @json($fallbackProvider),
            activeStack: @json($activeAiStack),
        };

        function providerPresentation(health) {
            const ok = health?.ok === true;
            const status = String(health?.status || '');
            const warningStatuses = ['rate_limited', 'timeout'];
            return {
                cardClass: ok ? 'status-connected' : (warningStatuses.includes(status) ? 'status-warning' : 'status-error'),
                pillClass: ok ? 'connected' : (warningStatuses.includes(status) ? 'warning' : 'error'),
                label: health?.label || (ok ? 'Connected' : 'Unavailable'),
                message: health?.message || '',
            };
        }

        function warningBannerMessage(health) {
            const provider = String(health?.provider || 'Provider');
            const status = String(health?.status || '');
            const name = provider.charAt(0).toUpperCase() + provider.slice(1);
            return ({
                auth_failed: `${name} API key invalid or revoked.`,
                quota_exceeded: `${name} billing limit reached or API credits exhausted.`,
                rate_limited: `${name} rate limit exceeded.`,
                not_configured: `${name} is not configured.`,
                timeout: `${name} connection timed out.`,
            })[status] || health?.message || `${name} is unavailable.`;
        }

        function syncProviderWarningBanner(health) {
            const container = document.getElementById('ai-warning-banners');
            if (!container || health?.ok === true) {
                return;
            }
            const provider = String(health?.provider || '');
            const severity = ['auth_failed', 'quota_exceeded', 'not_configured'].includes(String(health?.status || ''))
                ? 'danger'
                : 'warning';
            let banner = container.querySelector(`[data-provider="${provider}"]`);
            const message = warningBannerMessage(health);
            if (!banner) {
                banner = document.createElement('div');
                banner.className = `alert alert-${severity} mb-3 ai-provider-warning`;
                banner.dataset.provider = provider;
                banner.setAttribute('role', 'alert');
                banner.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-2"></i><span class="ai-provider-warning-text"></span>`;
                container.prepend(banner);
            }
            banner.className = `alert alert-${severity} mb-3 ai-provider-warning`;
            const text = banner.querySelector('.ai-provider-warning-text');
            if (text) {
                text.textContent = message;
            }
        }

        function applyProviderHealth(provider, health) {
            window.__aiProviderHealth[provider] = health;
            const ui = providerPresentation(health);
            const card = document.getElementById(`provider-card-${provider}`);
            const pill = document.getElementById(`provider-pill-${provider}`);
            const message = document.getElementById(`provider-message-${provider}`);
            const realtime = document.getElementById(`realtime-status-${provider}`);

            if (card) {
                card.classList.remove('status-connected', 'status-warning', 'status-error');
                card.classList.add(ui.cardClass);
            }
            if (pill) {
                pill.classList.remove('connected', 'warning', 'error');
                pill.classList.add(ui.pillClass);
                pill.textContent = ui.label;
            }
            if (message) {
                message.textContent = ui.message || '—';
            }
            if (realtime) {
                realtime.textContent = ui.label;
            }
            syncProviderWarningBanner(health);
            updateAggregateStatus();
        }

        function updateAggregateStatus() {
            const openai = window.__aiProviderHealth.openai || {};
            const claude = window.__aiProviderHealth.claude || {};
            const nvidia = window.__aiProviderHealth.nvidia || {};
            const glm = window.__aiProviderHealth.glm || {};
            const cfg = window.__aiProviderConfig || {};
            const openaiOk = openai.ok === true;
            const claudeOk = claude.ok === true;
            const nvidiaOk = nvidia.ok === true;
            const glmOk = glm.ok === true;
            let status = 'online';

            if (cfg.activeStack === 'nvidia') {
                if (!cfg.nvidiaConfigured || !nvidiaOk) {
                    status = 'offline';
                }
            } else if (cfg.activeStack === 'glm') {
                if (!cfg.glmConfigured || !glmOk) {
                    status = 'offline';
                }
            } else if (!cfg.openaiConfigured && !cfg.claudeConfigured) {
                status = 'offline';
            } else if (!openaiOk && !claudeOk) {
                status = 'offline';
            } else if (openaiOk !== claudeOk) {
                status = 'degraded';
            }

            const map = {
                online: { class: 'ai-status-online', icon: 'bi-check-circle-fill', label: 'Online' },
                offline: { class: 'ai-status-offline', icon: 'bi-x-circle-fill', label: 'Offline' },
                degraded: { class: 'ai-status-degraded', icon: 'bi-exclamation-triangle-fill', label: 'Degraded' },
                fallback: { class: 'ai-status-fallback', icon: 'bi-arrow-repeat', label: 'Fallback Active' },
            };
            const current = map[status] || map.online;
            const badge = document.getElementById('ai-aggregate-status-badge');
            const icon = document.getElementById('ai-aggregate-status-icon');
            const label = document.getElementById('ai-aggregate-status-label');
            const activeProvider = document.getElementById('ai-active-provider-label');

            if (badge) {
                badge.classList.remove('ai-status-online', 'ai-status-offline', 'ai-status-degraded', 'ai-status-fallback');
                badge.classList.add(current.class);
            }
            if (icon) {
                icon.className = `bi ${current.icon}`;
            }
            if (label) {
                label.textContent = current.label;
            }
            if (activeProvider) {
                if (cfg.activeStack === 'nvidia') {
                    activeProvider.textContent = 'NVIDIA';
                } else if (cfg.activeStack === 'glm') {
                    activeProvider.textContent = 'GLM';
                } else {
                    let providerName = cfg.primaryProvider || 'openai';
                    if (!openaiOk && claudeOk) {
                        providerName = cfg.fallbackProvider || 'claude';
                    } else if (!claudeOk && openaiOk) {
                        providerName = cfg.primaryProvider || 'openai';
                    }
                    activeProvider.textContent = providerName.charAt(0).toUpperCase() + providerName.slice(1);
                }
            }

            const nvidiaRealtime = document.getElementById('realtime-status-nvidia');
            if (nvidiaRealtime) {
                nvidiaRealtime.textContent = nvidia.label || (nvidiaOk ? 'Connected' : 'Unavailable');
            }
            const glmRealtime = document.getElementById('realtime-status-glm');
            if (glmRealtime) {
                glmRealtime.textContent = glm.label || (glmOk ? 'Connected' : 'Unavailable');
            }
        }

        document.querySelectorAll('.test-provider-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const provider = btn.dataset.provider;
                const box = document.getElementById('test-result-' + provider);
                if (!box) return;
                box.style.display = 'block';
                box.className = 'test-result-box alert alert-info';
                box.textContent = 'Running LLM completion probe…';
                btn.disabled = true;
                try {
                    const res = await fetch(`{{ url('/admin/ai/health/test') }}/${provider}`, {
                        method: 'POST',
                        headers: {
                            'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content,
                            'Accept': 'application/json',
                        },
                    });
                    const data = await res.json();
                    box.className = 'test-result-box alert ' + (data.ok ? 'alert-success' : 'alert-danger');
                    box.innerHTML = `<strong>${data.label || 'Result'}</strong>: ${data.message || ''}` +
                        (data.latency_ms ? ` · ${data.latency_ms}ms` : '') +
                        (data.sample_models ? `<br><small>Models: ${data.sample_models.join(', ')}</small>` : '');
                    applyProviderHealth(provider, data);
                } catch (e) {
                    box.className = 'test-result-box alert alert-danger';
                    box.textContent = 'Health check failed: ' + e.message;
                } finally {
                    btn.disabled = false;
                }
            });
        });

        @if ($aiLogsReady && !empty($dailyTrends))
            (function() {
                const labels = {!! json_encode(array_keys($dailyTrends)) !!};
                const requests = {!! json_encode(array_column(array_values($dailyTrends), 'requests')) !!};
                const tokens = {!! json_encode(array_column(array_values($dailyTrends), 'tokens')) !!};
                const successful = {!! json_encode(array_column(array_values($dailyTrends), 'successful')) !!};
                const failed = {!! json_encode(array_column(array_values($dailyTrends), 'failed')) !!};
                const openaiReq = {{ (int) ($statsMonth['by_provider']['openai']['requests'] ?? 0) }};
                const claudeReq = {{ (int) ($statsMonth['by_provider']['claude']['requests'] ?? 0) }};

                const chartOpts = {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 9 }, maxTicksLimit: 10 } },
                        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,.05)' } },
                    },
                };

                if (document.getElementById('dailyRequestsChart')) {
                    new Chart(document.getElementById('dailyRequestsChart'), {
                        type: 'line',
                        data: { labels, datasets: [{ data: requests, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,.1)', fill: true, tension: .3 }] },
                        options: chartOpts,
                    });
                }
                if (document.getElementById('dailyTokensChart')) {
                    new Chart(document.getElementById('dailyTokensChart'), {
                        type: 'bar',
                        data: { labels, datasets: [{ data: tokens, backgroundColor: 'rgba(245,158,11,.7)', borderRadius: 3 }] },
                        options: chartOpts,
                    });
                }
                if (document.getElementById('providerDistChart')) {
                    new Chart(document.getElementById('providerDistChart'), {
                        type: 'doughnut',
                        data: {
                            labels: ['OpenAI', 'Claude'],
                            datasets: [{ data: [openaiReq, claudeReq], backgroundColor: ['#6366f1', '#f59e0b'] }],
                        },
                        options: { responsive: true, maintainAspectRatio: false },
                    });
                }
                if (document.getElementById('successRateChart')) {
                    new Chart(document.getElementById('successRateChart'), {
                        type: 'bar',
                        data: {
                            labels,
                            datasets: [
                                { label: 'Success', data: successful, backgroundColor: 'rgba(16,185,129,.7)' },
                                { label: 'Failed', data: failed, backgroundColor: 'rgba(239,68,68,.7)' },
                            ],
                        },
                        options: { ...chartOpts, plugins: { legend: { display: true, position: 'bottom' } } },
                    });
                }
            })();
        @endif
    </script>
@endpush
