@extends('layouts.admin')

@section('title', 'Business Pins')
@section('page-title', 'Business Pins')

@section('breadcrumb')
    <li class="breadcrumb-item active">Business Pins</li>
@endsection

@section('content')
    <div class="mb-4">
        <h4 class="fw-bold mb-1" style="font-size:1.05rem">Google Places Business Pins</h4>
        <p class="mb-0" style="font-size:.82rem;color:var(--text-secondary)">
            Controls whether businesses fetched from the Google Places API are displayed on the map. When disabled,
            the automatic business pins stop rendering and no billed Google (Nearby Search / pin detail) calls are made,
            which pauses that display cost. The base map, place search box, tasks, and tracking all keep working.
        </p>
    </div>

    <div class="row g-3 mb-4">
        <div class="col-lg-5">
            <div class="metric-card p-4 h-100">
                <div class="section-label"><i class="bi bi-toggles"></i>Platform Master Toggle</div>

                <div class="d-flex align-items-center gap-2 mb-3">
                    <span style="font-size:.85rem;color:var(--text-secondary)">Current status:</span>
                    @if ($globalEnabled)
                        <span class="badge-status badge-approved">Enabled</span>
                    @else
                        <span class="badge-status badge-inactive">Disabled</span>
                    @endif
                </div>

                <p style="font-size:.78rem;color:var(--text-muted)" class="mb-3">
                    This is the platform-wide default for every organization. Individual organizations can be
                    overridden below (for example, keep pins on for a specific customer while off everywhere else).
                </p>

                <form action="{{ route('admin.map-display.global.update') }}" method="POST" class="d-grid gap-2">
                    @csrf
                    <input type="hidden" name="enabled" value="{{ $globalEnabled ? '0' : '1' }}">
                    <button type="submit"
                        class="btn btn-sm {{ $globalEnabled ? 'btn-outline-danger' : 'btn-outline-success' }}">
                        <i class="bi {{ $globalEnabled ? 'bi-toggle-off' : 'bi-toggle-on' }} me-1"></i>
                        {{ $globalEnabled ? 'Disable business pins' : 'Enable business pins' }}
                    </button>
                </form>

                @if (!empty($snapshot['updated_at']))
                    <div class="mt-3" style="font-size:.72rem;color:var(--text-muted)">
                        Last updated: {{ \Illuminate\Support\Carbon::parse($snapshot['updated_at'])->format('M j, Y g:i A') }}
                    </div>
                @endif
            </div>
        </div>

        <div class="col-lg-7">
            <div class="metric-card p-4 h-100">
                <div class="section-label"><i class="bi bi-info-circle"></i>How it works</div>
                <ul style="font-size:.8rem;color:var(--text-secondary);padding-left:1.1rem" class="mb-0 d-flex flex-column gap-2">
                    <li>Effective setting for an organization = its override (if set) otherwise the master toggle.</li>
                    <li>When off, the map still loads and users can still search for a specific place — only the
                        automatic business pins are hidden and their Google calls are skipped.</li>
                    <li>Changes take effect on clients within about a minute (no reload required).</li>
                </ul>
            </div>
        </div>
    </div>

    <div class="metric-card p-0 overflow-hidden">
        <div class="d-flex align-items-center justify-content-between px-4 py-3 gap-2 flex-wrap" style="border-bottom:1px solid var(--border)">
            <div class="section-label mb-0"><i class="bi bi-building"></i>Per-organization Override</div>
            <form action="{{ route('admin.map-display.index') }}" method="GET" class="d-flex gap-2">
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
                        <th>Override</th>
                        <th>Effective</th>
                        <th class="text-end">Set override</th>
                    </tr>
                </thead>
                <tbody>
                    @forelse ($companies as $company)
                        @php
                            $override = $company->map_poi_display_enabled;
                            $current = $override === null ? 'inherit' : ($override ? 'on' : 'off');
                            $effective = $override === null ? $globalEnabled : (bool) $override;
                        @endphp
                        <tr>
                            <td>
                                <div class="fw-semibold">{{ $company->name }}</div>
                                <div style="font-size:.72rem;color:var(--text-muted)">{{ $company->company_id }}</div>
                            </td>
                            <td>
                                @if ($current === 'inherit')
                                    <span class="badge-status badge-inactive">Inherit</span>
                                @elseif ($current === 'on')
                                    <span class="badge-status badge-approved">Forced on</span>
                                @else
                                    <span class="badge-status badge-rejected">Forced off</span>
                                @endif
                            </td>
                            <td>
                                @if ($effective)
                                    <span style="font-size:.8rem;color:var(--success, #16a34a)">Pins shown</span>
                                @else
                                    <span style="font-size:.8rem;color:var(--text-muted)">Pins hidden</span>
                                @endif
                            </td>
                            <td class="text-end">
                                <form action="{{ route('admin.map-display.companies.update', $company) }}" method="POST"
                                    class="d-inline-flex gap-1 justify-content-end">
                                    @csrf
                                    <input type="hidden" name="q" value="{{ $search }}">
                                    <select name="override" class="form-select form-select-sm" style="max-width:150px"
                                        onchange="this.form.submit()">
                                        <option value="inherit" @selected($current === 'inherit')>Inherit global</option>
                                        <option value="on" @selected($current === 'on')>Force on</option>
                                        <option value="off" @selected($current === 'off')>Force off</option>
                                    </select>
                                    <noscript><button type="submit" class="btn btn-sm btn-outline-primary">Save</button></noscript>
                                </form>
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="4" class="text-center py-4" style="color:var(--text-muted)">
                                No organizations found.
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
