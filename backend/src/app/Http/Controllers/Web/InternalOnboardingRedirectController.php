<?php

declare(strict_types=1);

namespace App\Http\Controllers\Web;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class InternalOnboardingRedirectController
{
    public function __invoke(Request $request, int $invitation, string $token): RedirectResponse
    {
        $frontendUrl = rtrim((string) config('internal_onboarding.frontend_onboarding_url'), '/');

        $query = http_build_query([
            'invitation_id' => $invitation,
            'token' => $token,
        ]);

        return redirect()->away($frontendUrl.'?'.$query);
    }
}
