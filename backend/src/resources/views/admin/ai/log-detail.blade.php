@extends('layouts.admin')

@section('title', 'AI Log Detail')
@section('page-title', 'AI Log Detail')

@section('breadcrumb')
    <li class="breadcrumb-item"><a href="{{ route('admin.ai.index') }}" class="text-decoration-none"
            style="color:var(--text-muted)">AI Management</a></li>
    <li class="breadcrumb-item"><a href="{{ route('admin.ai.logs.index') }}" class="text-decoration-none"
            style="color:var(--text-muted)">Logs</a></li>
    <li class="breadcrumb-item active">#{{ $log->id }}</li>
@endsection

@section('content')

    <div class="d-flex align-items-center gap-3 mb-4">
        <a href="{{ route('admin.ai.logs.index') }}" class="btn btn-sm btn-outline-secondary">
            <i class="bi bi-arrow-left me-1"></i>Back to Logs
        </a>
        @php
            $badgeClass = match ($log->status) {
                'success' => 'badge-active',
                'failed' => 'badge-rejected',
                'timeout' => 'badge-suspended',
                default => 'badge-inactive',
            };
        @endphp
        <span class="badge-status {{ $badgeClass }} fs-6">{{ ucfirst($log->status) }}</span>
    </div>

    <div class="row g-3">

        {{-- Request info --}}
        <div class="col-lg-6">
            <div class="metric-card p-4 h-100">
                <h6 class="section-label"><i class="bi bi-info-circle"></i>Request Info</h6>
                <div class="detail-row"><span class="detail-label">Log ID</span><span
                        class="detail-value">#{{ $log->id }}</span></div>
                <div class="detail-row"><span class="detail-label">Timestamp</span><span
                        class="detail-value">{{ $log->created_at?->format('M j, Y H:i:s') }}</span></div>
                <div class="detail-row"><span class="detail-label">Session ID</span><span class="detail-value"
                        style="font-family:monospace;font-size:.8rem">{{ $log->session_id ?? '—' }}</span></div>
                <div class="detail-row"><span class="detail-label">User</span><span
                        class="detail-value">{{ $log->user?->name ?? '—' }}
                        {{ $log->user ? '<span style="color:var(--text-muted);font-size:.78rem">(' . $log->user->email . ')</span>' : '' }}</span>
                </div>
                <div class="detail-row"><span class="detail-label">Company</span><span
                        class="detail-value">{{ $log->company?->name ?? 'ID: ' . ($log->company_id ?? '—') }}</span>
                </div>
                <div class="detail-row"><span class="detail-label">Provider</span><span
                        class="detail-value text-capitalize">{{ $log->provider ?? '—' }}</span></div>
                <div class="detail-row"><span class="detail-label">Model</span><span class="detail-value"
                        style="font-family:monospace">{{ $log->model ?? '—' }}</span></div>
                <div class="detail-row"><span class="detail-label">Intent Type</span><span
                        class="detail-value">{{ $log->intent_type ?? '—' }}</span></div>
                <div class="detail-row"><span class="detail-label">Tool</span><span class="detail-value"
                        style="font-family:monospace">{{ $log->tool_name ?? '—' }}</span></div>
            </div>
        </div>

        {{-- Performance & Tokens --}}
        <div class="col-lg-6">
            <div class="metric-card p-4 h-100">
                <h6 class="section-label"><i class="bi bi-speedometer2"></i>Performance &amp; Tokens</h6>
                <div class="detail-row"><span class="detail-label">Started At</span><span
                        class="detail-value">{{ $log->started_at?->format('H:i:s.u') ?? '—' }}</span></div>
                <div class="detail-row"><span class="detail-label">Ended At</span><span
                        class="detail-value">{{ $log->ended_at?->format('H:i:s.u') ?? '—' }}</span></div>
                <div class="detail-row"><span class="detail-label">Execution Time</span><span
                        class="detail-value">{{ $log->execution_ms ? $log->execution_ms . ' ms' : '—' }}</span></div>
                <div class="detail-row"><span class="detail-label">Prompt Length</span><span
                        class="detail-value">{{ $log->prompt_length ? number_format($log->prompt_length) . ' chars' : '—' }}</span>
                </div>
                <div class="detail-row"><span class="detail-label">Input Tokens</span><span
                        class="detail-value">{{ $log->input_tokens ? number_format($log->input_tokens) : '—' }}</span>
                </div>
                <div class="detail-row"><span class="detail-label">Output Tokens</span><span
                        class="detail-value">{{ $log->output_tokens ? number_format($log->output_tokens) : '—' }}</span>
                </div>
                <div class="detail-row"><span class="detail-label">Total Tokens</span><span
                        class="detail-value fw-bold">{{ $log->total_tokens ? number_format($log->total_tokens) : '—' }}</span>
                </div>
                <div class="detail-row"><span class="detail-label">Est. Cost</span><span class="detail-value fw-bold"
                        style="color:var(--accent)">${{ $log->estimated_cost_usd ? number_format((float) $log->estimated_cost_usd, 6) : '0.000000' }}</span>
                </div>
            </div>
        </div>

        {{-- Prompt --}}
        <div class="col-12">
            <div class="metric-card p-4">
                <h6 class="section-label"><i class="bi bi-chat-left-text"></i>User Prompt</h6>
                <pre
                    style="background:var(--surface-hover);border-radius:.5rem;padding:1rem;font-size:.82rem;white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto;margin:0">{{ $log->user_prompt ?? '—' }}</pre>

                @if ($log->sanitized_prompt && $log->sanitized_prompt !== $log->user_prompt)
                    <h6 class="section-label mt-3"><i class="bi bi-shield-check"></i>Sanitized Prompt (PII Redacted)</h6>
                    <pre
                        style="background:rgba(16,185,129,.06);border-radius:.5rem;padding:1rem;font-size:.82rem;white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto;margin:0">{{ $log->sanitized_prompt }}</pre>
                @endif
            </div>
        </div>

        {{-- Error info (if failed) --}}
        @if ($log->status !== 'success' && ($log->error_code || $log->error_message))
            <div class="col-12">
                <div class="metric-card p-4" style="border-left:3px solid var(--danger)">
                    <h6 class="section-label"><i class="bi bi-exclamation-triangle" style="color:var(--danger)"></i>Error
                        Information</h6>
                    @if ($log->error_code)
                        <div class="detail-row"><span class="detail-label">Error Code</span><span
                                class="detail-value fw-bold"
                                style="color:var(--danger);font-family:monospace">{{ $log->error_code }}</span></div>
                    @endif
                    @if ($log->error_message)
                        <div class="mt-2">
                            <div class="model-label mb-1">Error Message</div>
                            <pre
                                style="background:rgba(239,68,68,.06);border-radius:.5rem;padding:.85rem;font-size:.82rem;white-space:pre-wrap;word-break:break-word;margin:0">{{ $log->error_message }}</pre>
                        </div>
                    @endif
                    @if ($log->stack_trace)
                        <div class="mt-2">
                            <div class="model-label mb-1">Stack Trace</div>
                            <pre
                                style="background:var(--surface-hover);border-radius:.5rem;padding:.85rem;font-size:.72rem;white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto;margin:0">{{ $log->stack_trace }}</pre>
                        </div>
                    @endif
                </div>
            </div>
        @endif

    </div>

@endsection
