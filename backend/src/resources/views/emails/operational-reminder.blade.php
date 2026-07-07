@extends('emails.layouts.factory23', [
    'title' => 'Operational Reminder',
    'subtitle' => ($organizationName ?? config('brand.name')) . ' · Reminder',
])

@section('content')
    <h2 style="margin:0 0 12px 0;font-size:18px;color:#0B1215;">{{ $title }}</h2>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.55;color:#334155;">
        Hi {{ $recipientName }},
    </p>
    <p style="margin:0 0 18px 0;font-size:14px;line-height:1.55;color:#334155;">
        {{ $message }}
    </p>

    @if (!empty($actionUrl))
        @include('emails.components.cta-button', [
            'url' => $actionUrl,
            'label' => 'Open in App',
        ])
    @endif
@endsection

@section('footer')
    Automated reminder from {{ config('brand.name') }} on behalf of {{ $organizationName }}.
@endsection
