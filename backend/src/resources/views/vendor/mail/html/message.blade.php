<x-mail::layout>
{{-- Header --}}
<x-slot:header>
<x-mail::header :url="config('brand.website_url')">
{{ config('brand.name') }}
</x-mail::header>
</x-slot:header>

{{-- Body --}}
{!! $slot !!}

{{-- Subcopy --}}
@isset($subcopy)
<x-slot:subcopy>
<x-mail::subcopy>
{!! $subcopy !!}
</x-mail::subcopy>
</x-slot:subcopy>
@endisset

{{-- Footer --}}
<x-slot:footer>
<x-mail::footer>
© {{ date('Y') }} {{ config('brand.name') }}. All rights reserved.

[{{ config('brand.support_email') }}](mailto:{{ config('brand.support_email') }}) · [Privacy Policy]({{ config('brand.privacy_url') }}) · [Terms of Service]({{ config('brand.terms_url') }})

This is an automated message from {{ config('brand.name') }}. Please do not reply directly to this email.
</x-mail::footer>
</x-slot:footer>
</x-mail::layout>
