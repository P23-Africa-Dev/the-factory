@extends('emails.layouts.factory23', [
    'title' => 'Meeting Reminder',
    'subtitle' => ($organizationName ?? config('brand.name')) . ' · Meeting reminder',
])

@section('content')
    <h2 style="margin:0 0 12px 0;font-size:18px;color:#0B1215;">{{ $meeting['title'] ?? 'Upcoming Meeting' }}</h2>
    <p style="margin:0 0 16px 0;font-size:15px;font-weight:600;color:#0A1D25;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:12px 16px;">
        Starts {{ $remaining }}.
    </p>
    <p style="margin:0 0 18px 0;font-size:14px;line-height:1.55;color:#334155;">
        {{ $meeting['description'] ?? 'No description provided.' }}
    </p>

    @include('emails.components.detail-table', [
        'rows' => [
            'Date & Time' => ($meeting['start_at'] ?? '-') . ' to ' . ($meeting['end_at'] ?? '-'),
            'Timezone' => $meeting['timezone'] ?? '-',
            'Organizer' => ($meeting['organizer_name'] ?? '-') . ' (' . ($meeting['organizer_email'] ?? '-') . ')',
        ],
    ])

    @if (!empty($meeting['google_meet_url']))
        @include('emails.components.cta-button', [
            'url' => $meeting['google_meet_url'],
            'label' => 'Join Meeting',
        ])
        <p style="margin:0;font-size:12px;color:#64748B;">Google Meet: {{ $meeting['google_meet_url'] }}</p>
    @endif
@endsection

@section('footer')
    Automated reminder from {{ config('brand.name') }} on behalf of {{ $organizationName }}.
@endsection
