<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Billing;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Services\Demo\DemoCompanyService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class CompanyDemoController extends Controller
{
    public function __construct(private readonly DemoCompanyService $demoCompanyService) {}

    public function update(Request $request, Company $company): RedirectResponse
    {
        $validated = $request->validate([
            'is_demo' => ['required', 'boolean'],
        ]);

        if ($validated['is_demo']) {
            $this->demoCompanyService->markAsDemo($company);
        } else {
            $this->demoCompanyService->unmarkDemo($company);
        }

        return back()->with('status', $company->fresh()->name . ' demo flag updated.');
    }
}
