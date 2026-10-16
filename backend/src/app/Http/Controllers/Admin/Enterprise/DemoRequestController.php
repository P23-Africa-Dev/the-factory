<?php

namespace App\Http\Controllers\Admin\Enterprise;

use App\Enums\DemoRequestStatus;
use App\Http\Controllers\Controller;
use App\Exceptions\EnterpriseNotificationDeliveryException;
use App\Http\Controllers\Admin\Billing\AdminPaymentLinkController;
use App\Http\Requests\Enterprise\ActivateDemoRequest;
use App\Http\Requests\Enterprise\StoreDirectRegistrationRequest;
use App\Support\Billing\BillingPlanCatalog;
use App\Models\Admin;
use App\Models\CompanyDemoRequest;
use App\Services\Enterprise\DemoRequestService;
use DomainException;
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

    public function create(): View
    {
        return view('admin.enterprise.demo-requests.create', [
            'billingPlans' => BillingPlanCatalog::all(),
        ]);
    }

    public function store(StoreDirectRegistrationRequest $request): RedirectResponse
    {
        /** @var Admin $admin */
        $admin = auth('admin')->user();

        try {
            $result = $this->demoRequestService->createDirectRegistration(
                admin: $admin,
                data: $request->validated(),
            );
        } catch (EnterpriseNotificationDeliveryException $e) {
            return redirect()->back()
                ->withInput()
                ->withErrors(['email' => $e->getMessage()]);
        } catch (DomainException $e) {
            return redirect()->back()
                ->withInput()
                ->withErrors(['email' => $e->getMessage()]);
        }

        return redirect()->route('admin.enterprise.demo-requests.show', $result)
            ->with('status', $this->statusMessageForResult($result, (string) ($request->validated('action') ?? 'activate')));
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
            ->with('status', $this->statusMessageForResult($result, (string) ($request->validated('action') ?? 'activate')));
    }

    private function statusMessageForResult(CompanyDemoRequest $result, string $action): string
    {
        return match (true) {
            $action === 'draft' || $result->status === DemoRequestStatus::DRAFT->value
                => 'Enterprise registration draft saved successfully.',
            $action === 'provision' && ! $result->hasControlAccessEnabled()
                => 'Account provisioned. Activate the account for Control review, then send the invitation email when ready.',
            $action === 'activate' || ($result->isProvisioned() && $result->hasControlAccessEnabled())
                => 'Account activated for Control review. Temporary password is shown on this page. Send the invitation email when ready.',
            $action === 'send_invite' || $result->isApproved()
                => 'Invitation email sent successfully. The customer can complete first time setup with their own password.',
            $result->isProvisioned()
                => 'Account provisioned. Activate the account for Control review, then send the invitation email when ready.',
            default => 'Enterprise registration updated successfully.',
        };
    }
}
