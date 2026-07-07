@extends('layouts.admin')

@section('title', 'Manage Database')
@section('page-title', 'Manage Database')

@section('breadcrumb')
    <li class="breadcrumb-item active">Database</li>
@endsection

@section('content')
@include('admin.database._shell')

@if (session('status'))
    <div class="alert alert-success py-2" style="font-size:.82rem">{{ session('status') }}</div>
@endif

<div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
    <div>
        <h4 class="fw-bold mb-1" style="font-size:1.05rem">Tables</h4>
        <div style="font-size:.75rem;color:var(--text-muted)">
            Connection: <code>{{ $connection }}</code> / <code>{{ $driver }}</code> - {{ count($tables) }} tables
        </div>
    </div>
    <a href="{{ route('admin.database.tables.create') }}" class="btn btn-sm btn-danger">
        <i class="bi bi-plus-lg me-1"></i>New Table
    </a>
</div>

<div class="metric-card p-0 overflow-hidden">
    <div class="table-responsive">
        <table class="table table-hover mb-0" style="font-size:.82rem">
            <thead style="background: rgba(0,0,0,0.03)">
                <tr>
                    <th>Table</th>
                    <th style="width: 120px">Rows</th>
                    <th style="width: 160px">Sensitivity</th>
                    <th style="width: 160px" class="text-end">Actions</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($tables as $t)
                    <tr @if ($t['sensitive']) style="background: rgba(220,38,38,0.04)" @endif>
                        <td>
                            <a href="{{ route('admin.database.tables.show', $t['name']) }}"
                               class="text-decoration-none fw-semibold"
                               style="color: {{ $t['sensitive'] ? 'var(--danger, #dc2626)' : 'inherit' }}">
                                <i class="bi bi-table me-1"></i>{{ $t['name'] }}
                            </a>
                        </td>
                        <td>{{ number_format($t['rows']) }}</td>
                        <td>
                            @if ($t['sensitive'])
                                <span class="badge" style="background: var(--danger, #dc2626); color:#fff">
                                    <i class="bi bi-shield-exclamation me-1"></i>Sensitive
                                </span>
                            @else
                                <span class="badge bg-secondary">Normal</span>
                            @endif
                        </td>
                        <td class="text-end">
                            <a href="{{ route('admin.database.tables.show', ['table' => $t['name'], 'view' => 'structure']) }}"
                               class="btn btn-sm btn-outline-secondary">Structure</a>
                            <a href="{{ route('admin.database.tables.show', $t['name']) }}"
                               class="btn btn-sm btn-outline-primary">Data</a>
                        </td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    </div>
</div>

<div class="metric-card p-3 mt-3">
    <h6 class="fw-bold mb-2" style="font-size:.9rem"><i class="bi bi-key me-2"></i>Change Passcode</h6>
    <form method="POST" action="{{ route('admin.database.passcode.change') }}" class="row g-2">
        @csrf
        <div class="col-md-4">
            <input type="password" name="current_passcode" class="form-control form-control-sm @error('current_passcode') is-invalid @enderror" placeholder="Current passcode" required>
            @error('current_passcode')<div class="invalid-feedback">{{ $message }}</div>@enderror
        </div>
        <div class="col-md-4">
            <input type="password" name="new_passcode" class="form-control form-control-sm @error('new_passcode') is-invalid @enderror" placeholder="New passcode (min 8)" minlength="8" required>
            @error('new_passcode')<div class="invalid-feedback">{{ $message }}</div>@enderror
        </div>
        <div class="col-md-3">
            <input type="password" name="new_passcode_confirmation" class="form-control form-control-sm" placeholder="Confirm" minlength="8" required>
        </div>
        <div class="col-md-1 d-grid">
            <button type="submit" class="btn btn-sm btn-warning">Save</button>
        </div>
    </form>
</div>
@endsection
