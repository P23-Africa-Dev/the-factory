@extends('layouts.admin')

@section('title', 'ELY Agent')
@section('page-title', 'ELY Agent')

@section('breadcrumb')
    <li class="breadcrumb-item"><a href="{{ route('admin.ai.index') }}" class="text-decoration-none"
            style="color:var(--text-muted)">AI Management</a></li>
    <li class="breadcrumb-item active">ELY Agent</li>
@endsection

@section('content')
<div class="page-container">

    @if (session('status'))
        <div class="alert alert-success py-2 px-3" style="font-size:.85rem">{{ session('status') }}</div>
    @endif
    @if ($errors->any())
        <div class="alert alert-danger py-2 px-3" style="font-size:.85rem">{{ $errors->first() }}</div>
    @endif

    {{-- Engine status --}}
    <div class="metric-card p-4 mb-4">
        <div class="fw-bold mb-2" style="font-size:1rem">Tool-calling engine</div>
        <div class="row g-3" style="font-size:.85rem">
            <div class="col-md-3">
                <div style="color:var(--text-secondary)">Global engine (ELY_ENGINE)</div>
                <strong>{{ $engine === 'agent' ? 'Agent for every company' : 'Legacy (agent only for listed companies)' }}</strong>
            </div>
            <div class="col-md-3">
                <div style="color:var(--text-secondary)">Active AI stack</div>
                <strong>{{ strtoupper(str_replace('_', ' + ', $stack)) }}</strong>
            </div>
            <div class="col-md-3">
                <div style="color:var(--text-secondary)">Tool calling available</div>
                @if ($canUseTools)
                    <span class="badge text-bg-success">Yes</span>
                @else
                    <span class="badge text-bg-warning">No: set the provider API key. ELY stays on the legacy engine.</span>
                @endif
            </div>
            <div class="col-md-3">
                <div style="color:var(--text-secondary)">Tools</div>
                <strong>{{ $toolRows->count() }}</strong>
                ({{ $toolRows->where('kind', 'write')->count() }} actions)
                @if ($disabledTools !== [])
                    · disabled: {{ implode(', ', $disabledTools) }}
                @endif
            </div>
        </div>
    </div>

    {{-- Per-company rollout --}}
    <div class="metric-card p-4 mb-4">
        <div class="fw-bold mb-1" style="font-size:1rem">Per-company rollout</div>
        <p style="font-size:.82rem;color:var(--text-secondary)" class="mb-3">
            Companies listed here use the tool-calling engine even while the global engine is legacy.
            Demo companies always stay on legacy. Run <code>php artisan ely:eval</code> before adding companies.
        </p>
        @if ($companyIds !== [])
            <div class="mb-3" style="font-size:.85rem">
                @foreach ($companyIds as $id)
                    <span class="badge text-bg-light border me-1">#{{ $id }} {{ $companyNames[$id] ?? 'unknown' }}</span>
                @endforeach
            </div>
        @endif
        @if ($canManage)
            <form method="POST" action="{{ route('admin.ai.ely.rollout') }}" class="row g-2 align-items-end">
                @csrf
                <div class="col-md-9">
                    <label class="form-label" style="font-size:.75rem;font-weight:600;color:var(--text-secondary)">Company ids (comma separated)</label>
                    <input type="text" name="company_ids" class="form-control form-control-sm"
                        value="{{ old('company_ids', implode(', ', $companyIds)) }}" placeholder="e.g. 12, 48">
                </div>
                <div class="col-md-3 d-flex justify-content-end">
                    <button type="submit" class="btn btn-primary btn-sm px-4">Save rollout</button>
                </div>
            </form>
        @else
            <div style="font-size:.82rem;color:var(--text-secondary)">Ask a super admin to change the rollout.</div>
        @endif
    </div>

    {{-- Audit log --}}
    <div class="filter-bar mb-3">
        <form method="GET" action="{{ route('admin.ai.ely') }}" class="row g-2 align-items-end">
            <div class="col-md-3">
                <label class="form-label" style="font-size:.75rem;font-weight:600;color:var(--text-secondary)">Company id</label>
                <input type="number" name="company_id" value="{{ request('company_id') }}" class="form-control form-control-sm">
            </div>
            <div class="col-md-3">
                <label class="form-label" style="font-size:.75rem;font-weight:600;color:var(--text-secondary)">Outcome</label>
                <select name="outcome" class="form-select form-select-sm">
                    <option value="">All outcomes</option>
                    @foreach (['succeeded', 'failed', 'denied'] as $outcome)
                        <option value="{{ $outcome }}" {{ request('outcome') === $outcome ? 'selected' : '' }}>{{ ucfirst($outcome) }}</option>
                    @endforeach
                </select>
            </div>
            <div class="col-md-3">
                <label class="form-label" style="font-size:.75rem;font-weight:600;color:var(--text-secondary)">Tool</label>
                <input type="text" name="tool" value="{{ request('tool') }}" placeholder="e.g. crm." class="form-control form-control-sm">
            </div>
            <div class="col-md-3 d-flex justify-content-end">
                <button type="submit" class="btn btn-outline-secondary btn-sm px-4">Filter</button>
            </div>
        </form>
    </div>

    <div class="metric-card mb-4">
        <div class="table-card-header">
            <span class="fw-bold" style="font-size:.88rem">Actions ELY ran</span>
            @if ($audits)
                <span style="font-size:.78rem;color:var(--text-muted)">{{ $audits->total() }} total records</span>
            @endif
        </div>
        @if (! $auditsReady)
            <div class="p-4" style="font-size:.85rem;color:var(--text-secondary)">Run the migrations to create the ELY audit table.</div>
        @else
            <div class="table-responsive">
                <table class="table admin-table mb-0">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Company</th>
                            <th>User / role</th>
                            <th>Tool</th>
                            <th>Outcome</th>
                            <th>Confirmed</th>
                            <th>Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse ($audits as $audit)
                            <tr>
                                <td style="white-space:nowrap">{{ $audit->created_at?->format('M j, g:i A') }}</td>
                                <td>#{{ $audit->company_id }} {{ $companyNames[$audit->company_id] ?? '' }}</td>
                                <td>#{{ $audit->user_id }} · {{ $audit->role }}</td>
                                <td><code>{{ $audit->tool }}</code></td>
                                <td>
                                    <span class="badge {{ $audit->outcome === 'succeeded' ? 'text-bg-success' : ($audit->outcome === 'denied' ? 'text-bg-warning' : 'text-bg-danger') }}">{{ $audit->outcome }}</span>
                                    @if ($audit->undone_at)
                                        <span class="badge text-bg-secondary">undone</span>
                                    @endif
                                </td>
                                <td>{{ $audit->confirmed ? 'Yes' : 'No' }}</td>
                                <td style="max-width:420px;font-size:.78rem">
                                    {{ \Illuminate\Support\Str::limit((string) ($audit->error ?? ($audit->result['summary'] ?? '')), 160) }}
                                </td>
                            </tr>
                        @empty
                            <tr><td colspan="7" class="text-center p-4" style="color:var(--text-muted)">No ELY actions yet.</td></tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
            @if ($audits->hasPages())
                <div class="table-card-footer d-flex justify-content-end">{{ $audits->links() }}</div>
            @endif
        @endif
    </div>

    {{-- Tool catalogue --}}
    <div class="metric-card">
        <div class="table-card-header">
            <span class="fw-bold" style="font-size:.88rem">Tool catalogue</span>
        </div>
        <div class="table-responsive">
            <table class="table admin-table mb-0">
                <thead><tr><th>Tool</th><th>Kind</th><th>Admin</th><th>Supervisor</th><th>Agent</th></tr></thead>
                <tbody>
                    @foreach ($toolRows as $row)
                        <tr>
                            <td><code>{{ $row['name'] }}</code></td>
                            <td>{{ $row['kind'] }}</td>
                            <td>{{ $row['admin'] ? '✓' : '' }}</td>
                            <td>{{ $row['supervisor'] ? '✓' : '' }}</td>
                            <td>{{ $row['agent'] ? '✓' : '' }}</td>
                        </tr>
                    @endforeach
                </tbody>
            </table>
        </div>
    </div>

</div>
@endsection
