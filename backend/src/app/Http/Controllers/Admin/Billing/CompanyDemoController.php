<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Billing;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Services\Admin\AdminActionLogger;
use App\Services\Demo\DemoCompanyService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class CompanyDemoController extends Controller
{
    public function __construct(
        private readonly DemoCompanyService $demoCompanyService,
        private readonly AdminActionLogger $actionLogger,
    ) {}

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

        $this->actionLogger->log('billing.demo.updated', 'company', (string) $company->id, [
            'company_id' => (int) $company->id,
            'is_demo' => (bool) $validated['is_demo'],
        ]);

        return back()->with('status', $company->fresh()->name . ' demo flag updated.');
    }
}
