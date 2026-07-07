@extends('layouts.admin')

@section('title', 'Table: ' . $table)
@section('page-title', 'Table: ' . $table)

@section('breadcrumb')
    <li class="breadcrumb-item"><a href="{{ route('admin.database.index') }}" class="text-decoration-none">Database</a></li>
    <li class="breadcrumb-item active">{{ $table }}</li>
@endsection

@section('content')
@include('admin.database._shell')

@if (session('status'))
    <div class="alert alert-success py-2" style="font-size:.82rem">{{ session('status') }}</div>
@endif

@if ($sensitive)
    <div class="alert py-2 mb-3" style="font-size:.82rem;background: rgba(220,38,38,0.08); color: var(--danger, #dc2626); border: 1px solid var(--danger, #dc2626)">
        <i class="bi bi-shield-exclamation me-1"></i>
        <strong>Sensitive table.</strong> Editing rows or schema of <code>{{ $table }}</code> can break authentication, billing, or user access. Confirm every action carefully.
    </div>
@endif

<div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
    <ul class="nav nav-pills" style="font-size:.8rem">
        <li class="nav-item">
            <a class="nav-link {{ $view === 'data' ? 'active' : '' }}" href="{{ route('admin.database.tables.show', $table) }}">
                <i class="bi bi-list-ul me-1"></i>Data
            </a>
        </li>
        <li class="nav-item">
            <a class="nav-link {{ $view === 'structure' ? 'active' : '' }}" href="{{ route('admin.database.tables.show', ['table' => $table, 'view' => 'structure']) }}">
                <i class="bi bi-columns me-1"></i>Structure
            </a>
        </li>
        <li class="nav-item">
            <a class="nav-link {{ $view === 'indexes' ? 'active' : '' }}" href="{{ route('admin.database.tables.show', ['table' => $table, 'view' => 'indexes']) }}">
                <i class="bi bi-diagram-3 me-1"></i>Indexes
            </a>
        </li>
    </ul>

    <div class="d-flex gap-2">
        @if ($view === 'data' && $primaryKey)
            <a href="{{ route('admin.database.rows.create', $table) }}" class="btn btn-sm btn-primary">
                <i class="bi bi-plus-lg me-1"></i>New Row
            </a>
        @endif
        @if (! $undroppable)
            <form method="POST" action="{{ route('admin.database.tables.destroy', $table) }}" class="mb-0"
                onsubmit="return dropTableConfirm(this, @json($table), @json($sensitive))">
                @csrf
                @method('DELETE')
                <button type="submit" class="btn btn-sm btn-outline-danger">
                    <i class="bi bi-trash3 me-1"></i>Drop Table
                </button>
            </form>
        @endif
    </div>
</div>

@if ($view === 'structure')
    <div class="metric-card p-0 overflow-hidden mb-3">
        <table class="table mb-0" style="font-size:.8rem">
            <thead style="background: rgba(0,0,0,0.03)">
                <tr>
                    <th>Column</th><th>Type</th><th>Null</th><th>Default</th><th>Key</th><th class="text-end">Actions</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($columns as $c)
                    <tr>
                        <td><code>{{ $c['name'] }}</code></td>
                        <td>{{ $c['type'] }}</td>
                        <td>{{ $c['nullable'] ? 'YES' : 'NO' }}</td>
                        <td><code>{{ $c['default'] ?? '' }}</code></td>
                        <td>
                            @if ($c['primary'])<span class="badge bg-primary">PRIMARY</span>@endif
                            @if ($c['auto_increment'])<span class="badge bg-info">AI</span>@endif
                        </td>
                        <td class="text-end">
                            @if (! $c['primary'] && ! $undroppable)
                                <form method="POST" action="{{ route('admin.database.columns.destroy', ['table' => $table, 'column' => $c['name']]) }}" class="d-inline"
                                    onsubmit="return dropColumnConfirm(this, @json($table), @json($c['name']), @json($sensitive))">
                                    @csrf
                                    @method('DELETE')
                                    <button type="submit" class="btn btn-sm btn-outline-danger">
                                        <i class="bi bi-x-lg"></i>
                                    </button>
                                </form>
                            @endif
                        </td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    </div>

    <div class="metric-card p-3">
        <h6 class="fw-bold mb-2" style="font-size:.9rem"><i class="bi bi-plus-lg me-1"></i>Add Column</h6>
        <form method="POST" action="{{ route('admin.database.columns.store', $table) }}" class="row g-2"
              onsubmit="return sensitiveConfirm(this, @json($sensitive), 'add a column to ' + @json($table))">
            @csrf
            <div class="col-md-3">
                <input type="text" name="name" class="form-control form-control-sm" placeholder="column_name" required pattern="[A-Za-z_][A-Za-z0-9_]*">
            </div>
            <div class="col-md-3">
                <select name="type" class="form-select form-select-sm" required>
                    @foreach (\App\Services\Admin\Database\DatabaseSchemaService::supportedColumnTypes() as $t)
                        <option value="{{ $t }}">{{ $t }}</option>
                    @endforeach
                </select>
            </div>
            <div class="col-md-2">
                <input type="number" name="length" class="form-control form-control-sm" placeholder="Length">
            </div>
            <div class="col-md-2">
                <input type="text" name="default" class="form-control form-control-sm" placeholder="Default">
            </div>
            <div class="col-md-1 d-flex align-items-center">
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" name="nullable" value="1" id="nullableChk">
                    <label class="form-check-label small" for="nullableChk">Null</label>
                </div>
            </div>
            <div class="col-md-1 d-grid">
                <button type="submit" class="btn btn-sm btn-primary">Add</button>
            </div>
        </form>
    </div>

@elseif ($view === 'indexes')
    <div class="metric-card p-0 overflow-hidden">
        <table class="table mb-0" style="font-size:.82rem">
            <thead style="background: rgba(0,0,0,0.03)">
                <tr><th>Name</th><th>Columns</th><th>Unique</th></tr>
            </thead>
            <tbody>
                @forelse ($indexes as $idx)
                    <tr>
                        <td><code>{{ $idx['name'] }}</code></td>
                        <td>{{ implode(', ', $idx['columns']) }}</td>
                        <td>{{ $idx['unique'] ? 'YES' : 'NO' }}</td>
                    </tr>
                @empty
                    <tr><td colspan="3" class="text-center py-3" style="color:var(--text-muted)">No indexes</td></tr>
                @endforelse
            </tbody>
        </table>
    </div>

@else
    <form method="GET" class="mb-3">
        <input type="hidden" name="view" value="data">
        <div class="input-group input-group-sm" style="max-width: 400px">
            <span class="input-group-text"><i class="bi bi-search"></i></span>
            <input type="text" name="search" value="{{ $search }}" class="form-control" placeholder="Search text columns...">
            <button type="submit" class="btn btn-outline-secondary">Go</button>
        </div>
    </form>

    <div class="metric-card p-0 overflow-hidden">
        <div class="table-responsive">
            <table class="table table-hover mb-0" style="font-size:.78rem">
                <thead style="background: rgba(0,0,0,0.03)">
                    <tr>
                        @foreach ($columns as $c)
                            <th>{{ $c['name'] }}</th>
                        @endforeach
                        <th style="width: 130px" class="text-end">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    @forelse ($rows as $row)
                        @php $r = (array) $row; @endphp
                        <tr>
                            @foreach ($columns as $c)
                                <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                                    title="{{ is_scalar($r[$c['name']] ?? null) ? (string) ($r[$c['name']] ?? '') : json_encode($r[$c['name']] ?? null) }}">
                                    @php $val = $r[$c['name']] ?? null; @endphp
                                    @if ($val === null)
                                        <em style="color:var(--text-muted)">NULL</em>
                                    @elseif (is_scalar($val))
                                        {{ \Illuminate\Support\Str::limit((string) $val, 60) }}
                                    @else
                                        <code>{{ \Illuminate\Support\Str::limit(json_encode($val), 60) }}</code>
                                    @endif
                                </td>
                            @endforeach
                            <td class="text-end">
                                @if ($primaryKey)
                                    <a href="{{ route('admin.database.rows.edit', ['table' => $table, 'id' => $r[$primaryKey]]) }}"
                                       class="btn btn-sm btn-outline-primary"><i class="bi bi-pencil"></i></a>
                                    <form method="POST" action="{{ route('admin.database.rows.destroy', ['table' => $table, 'id' => $r[$primaryKey]]) }}" class="d-inline"
                                          onsubmit="return sensitiveConfirm(this, @json($sensitive), 'DELETE row ' + @json($r[$primaryKey]) + ' from ' + @json($table))">
                                        @csrf
                                        @method('DELETE')
                                        <button type="submit" class="btn btn-sm btn-outline-danger"><i class="bi bi-trash3"></i></button>
                                    </form>
                                @endif
                            </td>
                        </tr>
                    @empty
                        <tr><td colspan="{{ count($columns) + 1 }}" class="text-center py-3" style="color:var(--text-muted)">No rows</td></tr>
                    @endforelse
                </tbody>
            </table>
        </div>
    </div>

    @if ($rows)
        <div class="mt-3">{!! $rows->links() !!}</div>
    @endif
@endif

<script>
function sensitiveConfirm(form, sensitive, action) {
    var msg = 'You are about to ' + action + '.\n\nThis action is IRREVERSIBLE and is audit logged.\n\nContinue?';
    if (sensitive) {
        msg = 'SENSITIVE ENVIRONMENT WARNING\n\nThe table you are modifying is marked SENSITIVE. Editing it can break authentication, billing, or user access.\n\n' + msg;
    }
    return window.confirm(msg);
}
function dropTableConfirm(form, table, sensitive) {
    var name = window.prompt('Type the table name "' + table + '" to confirm DROP TABLE:');
    if (name !== table) { return false; }
    return sensitiveConfirm(form, sensitive, 'DROP TABLE ' + table + ' - this cannot be undone');
}
function dropColumnConfirm(form, table, column, sensitive) {
    return sensitiveConfirm(form, sensitive, 'DROP COLUMN ' + column + ' from ' + table);
}
</script>
@endsection
