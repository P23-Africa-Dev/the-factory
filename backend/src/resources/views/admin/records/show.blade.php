@extends('layouts.admin')

@section('title', $meta['title'])
@section('page-title', $meta['title'])

@section('breadcrumb')
    <li class="breadcrumb-item"><a href="{{ route('admin.records.index') }}">Records</a></li>
    <li class="breadcrumb-item active">{{ $meta['title'] }}</li>
@endsection

@section('content')
    <div class="mb-3 d-flex flex-wrap justify-content-between gap-2">
        <div>
            <h4 class="fw-bold mb-1" style="font-size:1.05rem">{{ $meta['title'] }}</h4>
            <p class="mb-0" style="font-size:.82rem;color:var(--text-secondary)">{{ $meta['description'] }}</p>
        </div>
        <a href="{{ route('admin.records.index') }}" class="btn btn-outline-secondary btn-sm align-self-start">All records</a>
    </div>

    @if ($report === 'location')
        <div class="alert alert-warning py-2" style="font-size:.82rem">
            GPS points and field-activity trails are removed after {{ $taskRetentionDays }} days for task tracking
            and {{ $fieldRetentionDays }} days for field activity. This report can only include dates that are still stored.
        </div>
    @endif

    @if ($report === 'security-events')
        <div class="alert alert-secondary py-2" style="font-size:.82rem">
            Sign-in, sign-out, and password reset rows exist only from the day this log started. Earlier attempts were not stored.
        </div>
    @endif

    @include('admin.records.partials.filters', [
        'action' => route('admin.records.show', $report),
        'filters' => $filters,
        'companies' => $companies,
        'slices' => $meta['slices'],
    ])

    @include('admin.records.partials.export-form', [
        'action' => route('admin.records.export', $report),
        'filters' => $filters,
        'requesterTypes' => $requesterTypes,
        'formId' => $report,
    ])

    <p class="small text-muted">{{ number_format($rows->total()) }} matching {{ \Illuminate\Support\Str::plural('row', $rows->total()) }}.</p>

    @include('admin.records.partials.table', [
        'columns' => $columns,
        'rows' => $rows,
    ])
@endsection
