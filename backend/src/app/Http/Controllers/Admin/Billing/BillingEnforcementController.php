<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Billing;

use App\Http\Controllers\Controller;
use App\Models\Admin;
use App\Services\Billing\BillingEnforcementSettingService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class BillingEnforcementController extends Controller
{
    public function __construct(private readonly BillingEnforcementSettingService $billingEnforcement) {}

    public function update(Request $request): RedirectResponse
    {
        $admin = auth('admin')->user();

        if (! $admin instanceof Admin) {
            abort(403, 'Unauthorized.');
        }

        $enabled = (bool) $request->boolean('enabled');

        $this->billingEnforcement->setEnabled($enabled, $admin);

        return redirect()
            ->route('admin.billing.index')
            ->with('status', $enabled
                ? 'Billing enforcement is now enabled.'
                : 'Billing enforcement is now disabled.');
    }
}
