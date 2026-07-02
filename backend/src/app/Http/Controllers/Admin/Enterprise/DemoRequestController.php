<?php

namespace App\Http\Controllers\Admin\Enterprise;

use App\Http\Controllers\Controller;
use App\Exceptions\EnterpriseNotificationDeliveryException;
use App\Http\Controllers\Admin\Billing\AdminPaymentLinkController;
use App\Http\Requests\Enterprise\ActivateDemoRequest;
use App\Support\Billing\BillingPlanCatalog;
use App\Models\Admin;
use App\Models\CompanyDemoRequest;
use App\Services\Enterprise\DemoRequestService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class DemoRequestController extends Controller
{
    public function __construct(private readonly DemoRequestService $demoRequestService) {}

    public function index(Request $request): View
    {
        $filters = [
            'search' => $request->string('search')->toString(),
            'status' => $request->string('status')->toString(),
        ];

        return view('admin.enterprise.demo-requests.index', [
            'requests' => $this->demoRequestService->paginateForAdmin($filters),
            'filters' => $filters,
        ]);
    }

    public function show(CompanyDemoRequest $demoRequest): View
    {
        return view('admin.enterprise.demo-requests.show', [
            'demoRequest' => $demoRequest->load(['company', 'user', 'reviewedByAdmin']),
            'billingPlans' => BillingPlanCatalog::all(),
            'billingSummary' => $demoRequest->company
                ? AdminPaymentLinkController::billingSummary($demoRequest->company)
                : null,
        ]);
    }

    public function activate(ActivateDemoRequest $request, CompanyDemoRequest $demoRequest): RedirectResponse
    {
        /** @var Admin $admin */
        $admin = auth('admin')->user();

        try {
            $result = $this->demoRequestService->registerFromAdmin(
                demoRequest: $demoRequest,
                admin: $admin,
                data: $request->validated(),
            );
        } catch (EnterpriseNotificationDeliveryException $e) {
            return redirect()->back()
                ->withInput()
                ->withErrors(['email' => $e->getMessage()]);
        }

        return redirect()->route('admin.enterprise.demo-requests.show', $demoRequest)
            ->with('status', $result->isApproved()
                ? 'Enterprise registration activated and first-time access email sent successfully.'
                : 'Enterprise registration draft saved successfully.');
    }
}
