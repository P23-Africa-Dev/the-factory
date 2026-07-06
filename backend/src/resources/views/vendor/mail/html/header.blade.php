@props(['url'])
<tr>
<td align="center" style="padding: 0 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr>
<td class="header">
<a href="{{ config('brand.website_url') }}" style="display: inline-block; text-decoration: none;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
<tr>
<td style="vertical-align: middle; padding-right: 12px;">
<img src="{{ config('brand.logo_url') }}" alt="{{ config('brand.name') }}" class="logo" width="40" height="40" style="display: block; border: 0; border-radius: 8px;">
</td>
<td style="vertical-align: middle;">
<span style="color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">{{ config('brand.name') }}</span>
@if (trim($slot ?? '') !== '' && trim($slot) !== config('brand.name'))
<br>
<span style="color: rgba(255,255,255,0.85); font-size: 13px; font-weight: 500;">{{ $slot }}</span>
@endif
</td>
</tr>
</table>
</a>
</td>
</tr>
</table>
</td>
</tr>
