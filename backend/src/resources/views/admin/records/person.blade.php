@extends('layouts.admin')

@section('title', 'Person pack')
@section('page-title', 'Person pack')

@section('breadcrumb')
    <li class="breadcrumb-item"><a href="{{ route('admin.records.index') }}">Records</a></li>
    <li class="breadcrumb-item active">Person pack</li>
@endsection

@section('content')
    <div class="mb-3">
        <h4 class="fw-bold mb-1" style="font-size:1.05rem">Person pack</h4>
        <p class="mb-0" style="font-size:.82rem;color:var(--text-secondary)">
            One person's identity, sign-in history, attendance, location sessions, tasks, and workforce changes for the selected dates.
            Location points older than {{ $taskRetentionDays }} days (task tracking) or {{ $fieldRetentionDays }} days (field activity) are no longer stored.
        </p>
    </div>

    @include('admin.records.partials.filters', [
        'action' => route('admin.records.person'),
        'filters' => $filters,
        'companies' => $companies,
        'slices' => [],
        'userId' => $filters->userId,
    ])

    @if ($missingUser)
        <div class="alert alert-warning py-2" style="font-size:.82rem">That person could not be found.</div>
    @endif

    @if ($matches !== [])
        <div class="card border-0 shadow-sm mb-4">
            <div class="card-body">
                <h6 class="fw-semibold mb-2">Matching people</h6>
                <ul class="mb-0">
                    @foreach ($matches as $match)
                        <li>
                            <a href="{{ route('admin.records.person', array_merge($filters->toArray(), ['user_id' => $match['id']])) }}">
                                {{ $match['name'] }} ({{ $match['email'] }})
                            </a>
                        </li>
                    @endforeach
                </ul>
            </div>
        </div>
    @endif

    @if ($pack)
        @include('admin.records.partials.export-form', [
            'action' => route('admin.records.person.export'),
            'filters' => $filters,
            'requesterTypes' => $requesterTypes,
            'formId' => 'person',
            'userId' => $pack['user']->id,
        ])

        <div class="card border-0 shadow-sm mb-4">
            <div class="card-body">
                <h6 class="fw-semibold mb-2">Identity</h6>
                <dl class="row mb-0" style="font-size:.82rem">
                    <dt class="col-sm-3">Name</dt>
                    <dd class="col-sm-9">{{ $pack['user']->name }}</dd>
                    <dt class="col-sm-3">Email</dt>
                    <dd class="col-sm-9">{{ $pack['user']->email }}</dd>
                    <dt class="col-sm-3">Internal role</dt>
                    <dd class="col-sm-9">{{ $pack['user']->internal_role ?: 'Account owner' }}</dd>
                    <dt class="col-sm-3">Active</dt>
                    <dd class="col-sm-9">{{ $pack['user']->is_active ? 'Yes' : 'No' }}</dd>
                    <dt class="col-sm-3">Suspended until</dt>
                    <dd class="col-sm-9">{{ $pack['user']->suspended_until ?: '—' }}</dd>
                    <dt class="col-sm-3">Deleted at</dt>
                    <dd class="col-sm-9">{{ $pack['user']->deleted_at ?: '—' }}</dd>
                </dl>
            </div>
        </div>

        <div class="card border-0 shadow-sm mb-4">
            @include('admin.records.partials.table', [
                'columns' => ['Company', 'Role', 'Joined at'],
                'rows' => $pack['memberships'],
            ])
        </div>

        @foreach ($pack['sections'] as $section)
            <div class="mb-4">
                <h6 class="fw-semibold">{{ $section['title'] }}</h6>
                <p class="small text-muted">
                    {{ number_format($section['total']) }} matching {{ \Illuminate\Support\Str::plural('row', $section['total']) }}.
                    @if ($section['total'] > count($section['rows']))
                        Showing the latest {{ count($section['rows']) }}. Export the pack for the full range.
                    @endif
                </p>
                @include('admin.records.partials.table', [
                    'columns' => $section['columns'],
                    'rows' => $section['rows'],
                ])
            </div>
        @endforeach
    @endif
@endsection
