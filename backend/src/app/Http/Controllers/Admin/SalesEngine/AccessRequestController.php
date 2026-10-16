<?php

namespace App\Http\Controllers\Admin\SalesEngine;

use App\Http\Controllers\Controller;
use App\Models\Admin;
use App\Models\SalesEngineAccessRequest;
use App\Services\SalesEngine\SalesEngineAccessRequestService;
use DomainException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;
use RuntimeException;

class AccessRequestController extends Controller
{
    public function __construct(private readonly SalesEngineAccessRequestService $accessRequests) {}

    public function index(Request $request): View
    {
        $filters = [
            'search' => $request->string('search')->toString(),
            'status' => $request->string('status')->toString(),
        ];

        return view('admin.sales-engine.access-requests.index', [
            'requests' => $this->accessRequests->paginateForAdmin($filters),
            'filters' => $filters,
        ]);
    }

    public function show(SalesEngineAccessRequest $accessRequest): View
    {
        return view('admin.sales-engine.access-requests.show', [
            'accessRequest' => $accessRequest->load(['user', 'company', 'reviewedByAdmin']),
        ]);
    }

    public function approve(Request $request, SalesEngineAccessRequest $accessRequest): RedirectResponse
    {
        /** @var Admin $admin */
        $admin = auth('admin')->user();
        $notes = $request->string('admin_notes')->toString() ?: null;

        try {
            $this->accessRequests->approve($accessRequest, $admin, $notes);
        } catch (DomainException|RuntimeException $e) {
            return redirect()->back()
                ->withInput()
                ->withErrors(['approve' => $e->getMessage()]);
        }

        return redirect()
            ->route('admin.sales-engine.access-requests.show', $accessRequest)
            ->with('status', 'Access request approved. The user has been provisioned in Sales Engine.');
    }

    public function decline(Request $request, SalesEngineAccessRequest $accessRequest): RedirectResponse
    {
        /** @var Admin $admin */
        $admin = auth('admin')->user();
        $notes = $request->string('admin_notes')->toString() ?: null;

        try {
            $this->accessRequests->decline($accessRequest, $admin, $notes);
        } catch (DomainException $e) {
            return redirect()->back()
                ->withInput()
                ->withErrors(['decline' => $e->getMessage()]);
        }

        return redirect()
            ->route('admin.sales-engine.access-requests.show', $accessRequest)
            ->with('status', 'Access request declined.');
    }
}
