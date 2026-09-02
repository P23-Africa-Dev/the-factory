@extends('layouts.admin')

@section('title', 'Places Search')
@section('page-title', 'Places Search')

@section('breadcrumb')
    <li class="breadcrumb-item active">Places Search</li>
@endsection

@section('content')
    @php
        $o = $overview;
        $settings = $o['settings'];
    @endphp

    <div class="mb-4 d-flex flex-wrap justify-content-between gap-2 align-items-start">
        <div>
            <h4 class="fw-bold mb-1" style="font-size:1.05rem">Places Search Analytics</h4>
            <p class="mb-0" style="font-size:.82rem;color:var(--text-secondary)">
                Geoapify ∥ Foursquare fan-out with Google conditional backstop. Cache hits are free; one credit charge per settled search.
            </p>
        </div>
        <form method="get" class="d-flex gap-2 align-items-center">
            <label class="small text-muted mb-0">Range</label>
            <select name="days" class="form-select form-select-sm" style="width:auto" onchange="this.form.submit()">
                @foreach ([1, 7, 14, 30, 90] as $d)
                    <option value="{{ $d }}" @selected($days === $d)>{{ $d }} day{{ $d > 1 ? 's' : '' }}</option>
                @endforeach
            </select>
        </form>
    </div>

    <div class="row g-3 mb-4">
        <div class="col-6 col-lg-3">
            <div class="stat-card p-3">
                <div class="stat-label mb-1">Requests</div>
                <div class="stat-value">{{ number_format($o['total']) }}</div>
                <div style="font-size:.75rem;color:var(--text-muted)">Last {{ $days }}d · today live {{ number_format($o['live_today']['total'] ?? 0) }}</div>
            </div>
        </div>
        <div class="col-6 col-lg-3">
            <div class="stat-card p-3">
                <div class="stat-label mb-1">Cache Hit %</div>
                <div class="stat-value">{{ $o['cache_hit_pct'] }}%</div>
                <div style="font-size:.75rem;color:var(--text-muted)">{{ number_format($o['cache_hit_count']) }} hits</div>
            </div>
        </div>
        <div class="col-6 col-lg-3">
            <div class="stat-card p-3">
                <div class="stat-label mb-1">Fallback %</div>
                <div class="stat-value">{{ $o['fallback_pct'] }}%</div>
                <div style="font-size:.75rem;color:var(--text-muted)">Depth &gt; 0</div>
            </div>
        </div>
        <div class="col-6 col-lg-3">
            <div class="stat-card p-3">
                <div class="stat-label mb-1">Est. API Cost</div>
                <div class="stat-value">${{ number_format($o['estimated_usd'], 2) }}</div>
                <div style="font-size:.75rem;color:var(--text-muted)">Avg {{ $o['avg_latency_ms'] }} ms</div>
            </div>
        </div>
    </div>

    <div class="row g-3 mb-4">
        <div class="col-lg-4">
            <div class="card border-0 shadow-sm h-100">
                <div class="card-body">
                    <h6 class="fw-semibold mb-3">Provider mix</h6>
                    @foreach (['geoapify' => 'Geoapify', 'foursquare' => 'Foursquare', 'google' => 'Google'] as $key => $label)
                        <div class="d-flex justify-content-between mb-2" style="font-size:.85rem">
                            <span>{{ $label }}</span>
                            <span class="fw-semibold">{{ $o['provider_pct'][$key] ?? 0 }}% <span class="text-muted">({{ number_format($o['provider_counts'][$key] ?? 0) }})</span></span>
                        </div>
                        <div class="progress mb-3" style="height:6px">
                            <div class="progress-bar {{ $key === 'google' ? 'bg-danger' : ($key === 'foursquare' ? 'bg-warning' : 'bg-success') }}"
                                 style="width: {{ min(100, $o['provider_pct'][$key] ?? 0) }}%"></div>
                        </div>
                    @endforeach
                </div>
            </div>
        </div>
        <div class="col-lg-4">
            <div class="card border-0 shadow-sm h-100">
                <div class="card-body">
                    <h6 class="fw-semibold mb-3">Result attribution mix</h6>
                    <p class="small text-muted mb-3">How often each provider appears in returned result <code>sources[]</code> (multi-source = one card tagged by 2+ providers).</p>
                    @foreach (['geoapify' => 'Geoapify', 'foursquare' => 'Foursquare', 'google' => 'Google'] as $key => $label)
                        <div class="d-flex justify-content-between mb-2" style="font-size:.85rem">
                            <span>{{ $label }}</span>
                            <span class="fw-semibold">{{ $o['sources_mix_pct'][$key] ?? 0 }}% <span class="text-muted">({{ number_format($o['sources_mix'][$key] ?? 0) }})</span></span>
                        </div>
                        <div class="progress mb-3" style="height:6px">
                            <div class="progress-bar {{ $key === 'google' ? 'bg-danger' : ($key === 'foursquare' ? 'bg-warning' : 'bg-success') }}"
                                 style="width: {{ min(100, $o['sources_mix_pct'][$key] ?? 0) }}%"></div>
                        </div>
                    @endforeach
                    <div class="d-flex justify-content-between" style="font-size:.85rem">
                        <span>Multi-source cards</span>
                        <span class="fw-semibold">{{ number_format($o['sources_mix']['multi_source'] ?? 0) }}</span>
                    </div>
                    <p class="small text-muted mt-2 mb-0">Today live multi-source: {{ number_format($o['live_sources_mix']['multi_source'] ?? 0) }}</p>
                </div>
            </div>
        </div>
        <div class="col-lg-4">
            <div class="card border-0 shadow-sm h-100">
                <div class="card-body">
                    <h6 class="fw-semibold mb-3">Traffic sources</h6>
                    @forelse ($o['sources'] as $source => $count)
                        <div class="d-flex justify-content-between mb-2" style="font-size:.85rem">
                            <span class="text-capitalize">{{ $source }}</span>
                            <span class="fw-semibold">{{ number_format($count) }}</span>
                        </div>
                    @empty
                        <p class="text-muted small mb-0">No traffic recorded yet.</p>
                    @endforelse
                    <hr>
                    <h6 class="fw-semibold mb-2">Operations</h6>
                    @forelse ($o['operations'] as $op => $count)
                        <div class="d-flex justify-content-between mb-1" style="font-size:.82rem">
                            <span>{{ $op }}</span>
                            <span>{{ number_format($count) }}</span>
                        </div>
                    @empty
                        <p class="text-muted small mb-0">—</p>
                    @endforelse
                </div>
            </div>
        </div>
        <div class="col-lg-4">
            <div class="card border-0 shadow-sm h-100">
                <div class="card-body">
                    <h6 class="fw-semibold mb-3">Provider settings</h6>
                    <form method="post" action="{{ route('admin.places.settings.update') }}">
                        @csrf
                        <div class="form-check form-switch mb-2">
                            <input class="form-check-input" type="checkbox" name="geoapify_enabled" value="1" id="geoapify_enabled" @checked($settings['geoapify_enabled'])>
                            <label class="form-check-label" for="geoapify_enabled">Geoapify (fan-out) @unless($settings['keys_configured']['geoapify']) <span class="badge text-bg-warning">no key</span> @endunless</label>
                        </div>
                        <div class="form-check form-switch mb-2">
                            <input class="form-check-input" type="checkbox" name="foursquare_enabled" value="1" id="foursquare_enabled" @checked($settings['foursquare_enabled'])>
                            <label class="form-check-label" for="foursquare_enabled">Foursquare (fan-out) @unless($settings['keys_configured']['foursquare']) <span class="badge text-bg-warning">no key</span> @endunless</label>
                        </div>
                        <div class="form-check form-switch mb-2">
                            <input class="form-check-input" type="checkbox" name="google_enabled" value="1" id="google_enabled" @checked($settings['google_enabled'])>
                            <label class="form-check-label" for="google_enabled">Google conditional backstop @unless($settings['keys_configured']['google']) <span class="badge text-bg-warning">no key</span> @endunless</label>
                        </div>
                        <div class="form-check form-switch mb-2">
                            <input class="form-check-input" type="checkbox" name="cache_enabled" value="1" id="cache_enabled" @checked($settings['cache_enabled'])>
                            <label class="form-check-label" for="cache_enabled">Redis/cache enabled</label>
                        </div>
                        <div class="form-check form-switch mb-2">
                            <input class="form-check-input" type="checkbox" name="show_provider_attribution" value="1" id="show_provider_attribution" @checked($settings['show_provider_attribution'] ?? true)>
                            <label class="form-check-label" for="show_provider_attribution">Show “via …” badges in apps</label>
                        </div>
                        <div class="form-check form-switch mb-3">
                            <input class="form-check-input" type="checkbox" name="foursquare_premium_fields" value="1" id="foursquare_premium_fields" @checked($settings['foursquare_premium_fields'] ?? false)>
                            <label class="form-check-label" for="foursquare_premium_fields">Foursquare Premium fields <span class="text-muted">(search/details only)</span></label>
                        </div>
                        <label class="form-label small">Quality threshold (0.1–1.0)</label>
                        <input type="number" step="0.01" min="0.1" max="1" name="quality_threshold" class="form-control form-control-sm mb-2" value="{{ $settings['quality_threshold'] }}">
                        <label class="form-label small">Max autocomplete results (1–15)</label>
                        <input type="number" min="1" max="15" name="max_results_autocomplete" class="form-control form-control-sm mb-2" value="{{ $settings['max_results_autocomplete'] ?? 12 }}">
                        <label class="form-label small">Max search results (1–20)</label>
                        <input type="number" min="1" max="20" name="max_results_search" class="form-control form-control-sm mb-3" value="{{ $settings['max_results_search'] ?? 15 }}">
                        <p class="small text-muted">Google daily budget (env): {{ $settings['google_daily_budget'] }}</p>
                        <button type="submit" class="btn btn-sm btn-primary">Save settings</button>
                    </form>
                </div>
            </div>
        </div>
    </div>

    <div class="card border-0 shadow-sm mb-4">
        <div class="card-body">
            <h6 class="fw-semibold mb-3">Top organizations</h6>
            <div class="table-responsive">
                <table class="table table-sm align-middle mb-0">
                    <thead>
                        <tr>
                            <th>Organization</th>
                            <th class="text-end">Requests</th>
                            <th class="text-end">Google calls</th>
                            <th class="text-end">Est. USD</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse ($companies as $row)
                            <tr>
                                <td>{{ $row['company_name'] }}</td>
                                <td class="text-end">{{ number_format($row['requests']) }}</td>
                                <td class="text-end">{{ number_format($row['google_calls']) }}</td>
                                <td class="text-end">${{ number_format($row['estimated_usd'], 3) }}</td>
                                <td class="text-end">
                                    <a class="small" href="{{ route('admin.map-credits.companies.show', $row['company_id']) }}">Credits</a>
                                </td>
                            </tr>
                        @empty
                            <tr><td colspan="5" class="text-muted">No company usage yet.</td></tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <div class="card border-0 shadow-sm">
        <div class="card-body">
            <h6 class="fw-semibold mb-3">Recent events</h6>
            <div class="table-responsive">
                <table class="table table-sm align-middle mb-0" style="font-size:.8rem">
                    <thead>
                        <tr>
                            <th>When</th>
                            <th>Org</th>
                            <th>Source</th>
                            <th>Op</th>
                            <th>Provider</th>
                            <th>Cache</th>
                            <th>Fallback</th>
                            <th>ms</th>
                            <th>n</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse ($events as $e)
                            <tr>
                                <td>{{ $e['created_at'] }}</td>
                                <td>{{ $e['company'] ?? '—' }}</td>
                                <td>{{ $e['source'] }}</td>
                                <td>{{ $e['operation'] }}</td>
                                <td>{{ $e['provider'] ?? '—' }}</td>
                                <td>{{ $e['cache_hit'] ? 'hit' : 'miss' }}</td>
                                <td>{{ $e['fallback_depth'] }}</td>
                                <td>{{ $e['latency_ms'] }}</td>
                                <td>{{ $e['result_count'] }}</td>
                                <td>{{ $e['status'] }}</td>
                            </tr>
                        @empty
                            <tr><td colspan="10" class="text-muted">No events yet.</td></tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>
    </div>
@endsection
