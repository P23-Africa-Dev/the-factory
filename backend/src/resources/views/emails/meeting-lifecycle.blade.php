@extends('emails.layouts.factory23', [
    'title' => 'Meeting Notification',
    'subtitle' => ($organizationName ?? config('brand.name')) .
        ' · ' .
        match ($eventType) {
            'created' => 'Meeting scheduled',
            'updated' => 'Meeting updated',
            'cancelled' => 'Meeting cancelled',
            'deleted' => 'Meeting deleted',
            default => 'Meeting notification',
        },
])

@section('content')
    <h2 style="margin:0 0 12px 0;font-size:18px;color:#0B1215;">{{ $meeting['title'] ?? 'Meeting' }}</h2>
    <p style="margin:0 0 18px 0;font-size:14px;line-height:1.55;color:#334155;">
        {{ $meeting['description'] ?? 'No description provided.' }}
    </p>

    @include('emails.components.detail-table', [
        'rows' => [
            'Date & Time' => ($meeting['start_at'] ?? '-') . ' to ' . ($meeting['end_at'] ?? '-'),
            'Timezone' => $meeting['timezone'] ?? '-',
            'Organizer' => ($meeting['organizer_name'] ?? '-') . ' (' . ($meeting['organizer_email'] ?? '-') . ')',
            'Meeting ID' => $meeting['id'] ?? '-',
        ],
    ])

    @if (!empty($meeting['google_meet_url']))
        @include('emails.components.cta-button', [
            'url' => $meeting['google_meet_url'],
            'label' => 'Join Meeting',
        ])
        <p style="margin:0;font-size:12px;color:#64748B;">Google Meet: {{ $meeting['google_meet_url'] }}</p>
    @endif

    @if (!empty($attendees))
        <div style="margin-top:20px;">
            <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:#0B1215;">Attendees</p>
            <ul style="margin:0;padding-left:18px;font-size:12px;color:#334155;line-height:1.7;">
                @foreach ($attendees as $attendee)
                    <li>{{ $attendee['display_name'] ?: $attendee['email'] }} ({{ $attendee['email'] }})</li>
                @endforeach
            </ul>
        </div>
    @endif
@endsection

@section('footer')
    Sent via {{ config('brand.name') }} on behalf of {{ $organizationName }}. You are receiving this because you are part of this meeting.
@endsection
