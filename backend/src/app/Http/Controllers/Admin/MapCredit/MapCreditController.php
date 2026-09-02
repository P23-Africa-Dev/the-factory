<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\MapCredit;

use App\Http\Controllers\Controller;
use App\Models\Admin;
use App\Models\Company;
use App\Models\CompanyMapCredit;
use App\Models\MapCreditSku;
use App\Models\MapCreditTransaction;
use App\Services\Billing\CreditAllocationSettingService;
use App\Services\Billing\MapCreditService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class MapCreditController extends Controller
{
    public function __construct(
        private readonly CreditAllocationSettingService $settings,
        private readonly MapCreditService $mapCredits,
    ) {}

    public function index(Request $request): View
    {
        $search = trim((string) $request->query('q', ''));

        $companies = CompanyMapCredit::query()
            ->with('company')
            ->when($search !== '', function ($query) use ($search): void {
                $query->whereHas('company', function ($q) use ($search): void {
                    $q->where('name', 'like', "%{$search}%")
                        ->orWhere('company_id', 'like', "%{$search}%");
                });
            })
            ->orderByDesc('lifetime_consumed')
            ->paginate(20)
            ->withQueryString();

        $stats = [
            'org_count' => CompanyMapCredit::query()->count(),
            'lifetime_consumed' => (float) CompanyMapCredit::query()->sum('lifetime_consumed'),
            'lifetime_topped_up' => (float) CompanyMapCredit::query()->sum('lifetime_topped_up'),
            'balance_outstanding' => (float) CompanyMapCredit::query()->sum('plan_credits')
                + (float) CompanyMapCredit::query()->sum('topup_credits'),
        ];

        return view('admin.map-credits.index', [
            'settings' => $this->settings->snapshot(),
            'skus' => MapCreditSku::query()->orderBy('sort_order')->orderBy('sku')->get(),
            'companies' => $companies,
            'stats' => $stats,
            'creditsPerUsd' => $this->mapCredits->creditsPerUsd(),
            'search' => $search,
        ]);
    }

    public function updateSettings(Request $request): RedirectResponse
    {
        $admin = auth('admin')->user();

        if (! $admin instanceof Admin) {
            abort(403, 'Unauthorized.');
        }

        $validated = $request->validate([
            'allocation_percent' => ['required', 'numeric', 'min:0', 'max:100'],
            'credits_per_usd' => ['required', 'numeric', 'min:1', 'max:100000'],
            'low_threshold_percent' => ['required', 'numeric', 'min:0', 'max:100'],
            'enforce' => ['nullable', 'boolean'],
        ]);

        $this->settings->setAllocationPercent((float) $validated['allocation_percent'], $admin);
        $this->settings->setCreditsPerUsd((float) $validated['credits_per_usd'], $admin);
        $this->settings->setLowThresholdPercent((float) $validated['low_threshold_percent'], $admin);
        $this->settings->setEnforcement($request->boolean('enforce'), $admin);

        return redirect()
            ->route('admin.map-credits.index')
            ->with('status', 'Map credit settings updated. New allocations apply at each org\'s next cycle.');
    }

    public function show(Company $company): View
    {
        $snapshot = $this->mapCredits->snapshot($company);

        $transactions = MapCreditTransaction::query()
            ->where('company_id', $company->id)
            ->latest()
            ->paginate(30);

        $bySku = MapCreditTransaction::query()
            ->where('company_id', $company->id)
            ->where('type', MapCreditTransaction::TYPE_CONSUMPTION)
            ->selectRaw('sku, COUNT(*) as calls, SUM(ABS(credits)) as credits')
            ->groupBy('sku')
            ->orderByDesc('credits')
            ->get();

        return view('admin.map-credits.show', [
            'company' => $company,
            'snapshot' => $snapshot,
            'transactions' => $transactions,
            'bySku' => $bySku,
            'creditsPerUsd' => $this->mapCredits->creditsPerUsd(),
        ]);
    }

    public function adjust(Request $request, Company $company): RedirectResponse
    {
        $admin = auth('admin')->user();

        if (! $admin instanceof Admin) {
            abort(403, 'Unauthorized.');
        }

        $validated = $request->validate([
            'credits' => ['required', 'numeric'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $this->mapCredits->adminAdjust(
            company: $company,
            creditsDelta: (float) $validated['credits'],
            admin: $admin,
            reason: (string) ($validated['reason'] ?? ''),
        );

        return redirect()
            ->route('admin.map-credits.companies.show', $company)
            ->with('status', 'Credit balance adjusted.');
    }
}
