<!doctype html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ $title ?? config('brand.name') }}</title>
</head>

<body style="margin:0;padding:0;background:#F4F7FB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#334155;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FB;padding:24px 16px;">
        <tr>
            <td align="center">
                <table role="presentation" width="600" cellpadding="0" cellspacing="0"
                    style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E2E8F0;">
                    <tr>
                        <td style="background:#0A1D25;color:#ffffff;padding:22px 28px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td style="vertical-align:middle;padding-right:12px;">
                                        <img src="{{ config('brand.logo_url') }}" alt="{{ config('brand.name') }}"
                                            width="40" height="40"
                                            style="display:block;border:0;border-radius:8px;">
                                    </td>
                                    <td style="vertical-align:middle;">
                                        <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">
                                            {{ config('brand.name') }}</p>
                                        @isset($subtitle)
                                            <p style="margin:8px 0 0 0;font-size:13px;color:rgba(255,255,255,0.85);">
                                                {{ $subtitle }}</p>
                                        @endisset
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:28px;">
                            @yield('content')
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:16px 28px;background:#F8FAFC;color:#64748B;font-size:11px;line-height:1.6;">
                            @hasSection('footer')
                                @yield('footer')
                            @else
                                This is an automated message from {{ config('brand.name') }}.
                            @endif
                            <br><br>
                            © {{ date('Y') }} {{ config('brand.name') }} ·
                            <a href="mailto:{{ config('brand.support_email') }}"
                                style="color:#64748B;">{{ config('brand.support_email') }}</a>
                            ·
                            <a href="{{ config('brand.privacy_url') }}" style="color:#64748B;">Privacy</a>
                            ·
                            <a href="{{ config('brand.terms_url') }}" style="color:#64748B;">Terms</a>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>

</html>
