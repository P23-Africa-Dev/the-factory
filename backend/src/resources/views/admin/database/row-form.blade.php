@extends('layouts.admin')

@section('title', ($mode === 'edit' ? 'Edit Row' : 'New Row') . ' - ' . $table)
@section('page-title', ($mode === 'edit' ? 'Edit Row' : 'New Row') . ' - ' . $table)

@section('breadcrumb')
    <li class="breadcrumb-item"><a href="{{ route('admin.database.index') }}" class="text-decoration-none">Database</a></li>
    <li class="breadcrumb-item"><a href="{{ route('admin.database.tables.show', $table) }}" class="text-decoration-none">{{ $table }}</a></li>
    <li class="breadcrumb-item active">{{ $mode === 'edit' ? 'Edit' : 'New' }}</li>
@endsection

@section('content')
@include('admin.database._shell')

@if ($sensitive)
    <div class="alert py-2 mb-3" style="font-size:.82rem;background: rgba(220,38,38,0.08); color: var(--danger, #dc2626); border: 1px solid var(--danger, #dc2626)">
        <i class="bi bi-shield-exclamation me-1"></i>
        <strong>Sensitive table.</strong> Confirm carefully before saving.
    </div>
@endif

<form method="POST"
      action="{{ $mode === 'edit'
        ? route('admin.database.rows.update', ['table' => $table, 'id' => $rowId])
        : route('admin.database.rows.store', $table) }}"
      onsubmit="return sensitiveConfirm(this, @json($sensitive), @json($mode === 'edit' ? 'UPDATE row ' . $rowId . ' in ' . $table : 'INSERT new row into ' . $table))">
    @csrf
    @if ($mode === 'edit') @method('PATCH') @endif

    <div class="metric-card p-4">
        <h5 class="fw-bold mb-3" style="font-size:.95rem">
            {{ $mode === 'edit' ? 'Edit Row #' . $rowId : 'New Row' }}
            <span class="badge bg-secondary ms-2">{{ $table }}</span>
        </h5>

        @foreach ($columns as $c)
            @php
                $isPk = $c['primary'] && $c['auto_increment'];
                $val = $row[$c['name']] ?? '';
                if (! is_scalar($val) && $val !== null) { $val = json_encode($val); }
            @endphp
            <div class="mb-3">
                <label class="form-label small fw-semibold">
                    <code>{{ $c['name'] }}</code>
                    <span style="color:var(--text-muted);font-weight:400">{{ $c['type'] }}</span>
                    @if (! $c['nullable']) <span class="text-danger">*</span> @endif
                    @if ($c['primary']) <span class="badge bg-primary">PRIMARY</span> @endif
                </label>
                @if ($mode === 'edit' && $isPk)
                    <input type="text" class="form-control form-control-sm" value="{{ $val }}" disabled>
                @elseif (preg_match('/text|json/i', $c['type']))
                    <textarea name="{{ $c['name'] }}" class="form-control form-control-sm" rows="3" @if(!$c['nullable'] && !$isPk)required @endif>{{ $val }}</textarea>
                @elseif (preg_match('/^tinyint\(1\)|^bool/i', $c['type']))
                    <select name="{{ $c['name'] }}" class="form-select form-select-sm">
                        @if ($c['nullable']) <option value="">NULL</option> @endif
                        <option value="0" @selected((string)$val === '0')>0 (false)</option>
                        <option value="1" @selected((string)$val === '1')>1 (true)</option>
                    </select>
                @else
                    <input type="text" name="{{ $c['name'] }}" value="{{ $val }}"
                        class="form-control form-control-sm"
                        @if (! $c['nullable'] && ! $isPk) required @endif>
                @endif
            </div>
        @endforeach

        <div class="d-flex gap-2 justify-content-end">
            <a href="{{ route('admin.database.tables.show', $table) }}" class="btn btn-sm btn-outline-secondary">Cancel</a>
            <button type="submit" class="btn btn-sm btn-danger">
                <i class="bi bi-save me-1"></i>{{ $mode === 'edit' ? 'Save Changes' : 'Insert Row' }}
            </button>
        </div>
    </div>
</form>

<script>
function sensitiveConfirm(form, sensitive, action) {
    var msg = 'You are about to ' + action + '.\n\nThis action is IRREVERSIBLE and is audit logged.\n\nContinue?';
    if (sensitive) {
        msg = 'SENSITIVE ENVIRONMENT WARNING\n\nThe table is marked SENSITIVE. Editing it can break authentication, billing, or user access.\n\n' + msg;
    }
    return window.confirm(msg);
}
</script>
@endsection
