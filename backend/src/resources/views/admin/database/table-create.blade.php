@extends('layouts.admin')

@section('title', 'Create Table')
@section('page-title', 'Create Table')

@section('breadcrumb')
    <li class="breadcrumb-item"><a href="{{ route('admin.database.index') }}" class="text-decoration-none">Database</a></li>
    <li class="breadcrumb-item active">Create Table</li>
@endsection

@section('content')
@include('admin.database._shell')

<form method="POST" action="{{ route('admin.database.tables.store') }}"
      onsubmit="return confirm('Create a new table? This alters the live schema. Continue?')">
    @csrf
    <div class="metric-card p-4">
        <h5 class="fw-bold mb-3" style="font-size:.95rem">New Table Definition</h5>

        <div class="mb-3">
            <label class="form-label small fw-semibold">Table Name</label>
            <input type="text" name="name" class="form-control form-control-sm" required pattern="[A-Za-z_][A-Za-z0-9_]*"
                placeholder="e.g. my_new_table">
            <div class="form-text" style="font-size:.72rem">
                An <code>id</code> primary key and <code>timestamps</code> are added automatically.
            </div>
        </div>

        <label class="form-label small fw-semibold">Columns</label>
        <div id="colsWrap"></div>
        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="addCol()">
            <i class="bi bi-plus-lg me-1"></i>Add Column
        </button>

        <div class="d-flex gap-2 justify-content-end mt-4">
            <a href="{{ route('admin.database.index') }}" class="btn btn-sm btn-outline-secondary">Cancel</a>
            <button type="submit" class="btn btn-sm btn-danger">Create Table</button>
        </div>
    </div>
</form>

<script>
var TYPES = @json($types);
var idx = 0;
function addCol() {
    var i = idx++;
    var html = '<div class="row g-2 mb-2 align-items-end col-row">' +
        '<div class="col-md-3"><input type="text" name="columns[' + i + '][name]" class="form-control form-control-sm" placeholder="column_name" pattern="[A-Za-z_][A-Za-z0-9_]*" required></div>' +
        '<div class="col-md-3"><select name="columns[' + i + '][type]" class="form-select form-select-sm">' +
        TYPES.map(function(t){return '<option value="'+t+'">'+t+'</option>';}).join('') + '</select></div>' +
        '<div class="col-md-2"><input type="number" name="columns[' + i + '][length]" class="form-control form-control-sm" placeholder="Length"></div>' +
        '<div class="col-md-2"><input type="text" name="columns[' + i + '][default]" class="form-control form-control-sm" placeholder="Default"></div>' +
        '<div class="col-md-1"><div class="form-check"><input class="form-check-input" type="checkbox" name="columns[' + i + '][nullable]" value="1"><label class="form-check-label small">Null</label></div></div>' +
        '<div class="col-md-1"><button type="button" class="btn btn-sm btn-outline-danger" onclick="this.closest(\'.col-row\').remove()"><i class="bi bi-x"></i></button></div>' +
        '</div>';
    document.getElementById('colsWrap').insertAdjacentHTML('beforeend', html);
}
addCol();
</script>
@endsection
