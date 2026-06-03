<!doctype html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Meeting Reminder</title>
</head>

<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#10212b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:24px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="640" cellpadding="0" cellspacing="0"
                    style="max-width:640px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
                    <tr>
                        <td style="background:#0b4a5a;color:#ffffff;padding:22px 28px;">
                            <h1 style="margin:0;font-size:20px;font-weight:700;">{{ $organizationName }}</h1>
                            <p style="margin:8px 0 0 0;font-size:13px;opacity:.9;">Meeting reminder</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:24px 28px;">
                            <h2 style="margin:0 0 12px 0;font-size:18px;">{{ $meeting['title'] ?? 'Upcoming Meeting' }}
                            </h2>
                            <p style="margin:0 0 12px 0;font-size:14px;color:#334155;">Starts {{ $remaining }}.</p>
                            <p style="margin:0 0 16px 0;font-size:14px;color:#334155;">
                                {{ $meeting['description'] ?? 'No description provided.' }}</p>

                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                                style="font-size:13px;color:#1e293b;border-collapse:collapse;">
                                <tr>
                                    <td style="padding:8px 0;width:170px;color:#64748b;">Date & Time</td>
                                    <td style="padding:8px 0;">{{ $meeting['start_at'] ?? '-' }} to
                                        {{ $meeting['end_at'] ?? '-' }}</td>
                                </tr>
                                <tr>
                                    <td style="padding:8px 0;color:#64748b;">Timezone</td>
                                    <td style="padding:8px 0;">{{ $meeting['timezone'] ?? '-' }}</td>
                                </tr>
                                <tr>
                                    <td style="padding:8px 0;color:#64748b;">Organizer</td>
                                    <td style="padding:8px 0;">{{ $meeting['organizer_name'] ?? '-' }}
                                        ({{ $meeting['organizer_email'] ?? '-' }})</td>
                                </tr>
                            </table>

                            @if (!empty($meeting['google_meet_url']))
                                <div style="margin-top:20px;">
                                    <a href="{{ $meeting['google_meet_url'] }}"
                                        style="display:inline-block;background:#0b4a5a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-size:13px;font-weight:700;">Join
                                        Meeting</a>
                                    <p style="margin:10px 0 0 0;font-size:12px;color:#64748b;">Google Meet:
                                        {{ $meeting['google_meet_url'] }}</p>
                                </div>
                            @endif
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:16px 28px;background:#f8fafc;color:#64748b;font-size:11px;">
                            This is an automated reminder from {{ $organizationName }}.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>

</html>
