<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Map;

use App\Http\Controllers\Controller;
use App\Models\Admin;
use App\Models\Company;
use App\Services\Map\MapPoiDisplaySettingService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class MapPoiDisplayController extends Controller
{
    public function __construct(private readonly MapPoiDisplaySettingService $poiDisplay) {}

    public function index(Request $request): View
    {
        $search = trim((string) $request->query('q', ''));

        $companies = Company::query()
            ->when($search !== '', function ($query) use ($search): void {
                $query->where(function ($q) use ($search): void {
                    $q->where('name', 'like', "%{$search}%")
                        ->orWhere('company_id', 'like', "%{$search}%");
                });
            })
            ->orderBy('name')
            ->paginate(20)
            ->withQueryString();

        return view('admin.map-display.index', [
            'snapshot' => $this->poiDisplay->snapshot(),
            'globalEnabled' => $this->poiDisplay->globalEnabled(),
            'companies' => $companies,
            'search' => $search,
        ]);
    }

    public function updateGlobal(Request $request): RedirectResponse
    {
        $admin = auth('admin')->user();

        if (! $admin instanceof Admin) {
            abort(403, 'Unauthorized.');
        }

        $enabled = (bool) $request->boolean('enabled');

        $this->poiDisplay->setGlobal($enabled, $admin);

        return redirect()
            ->route('admin.map-display.index')
            ->with('status', $enabled
                ? 'Business pins are now enabled platform-wide.'
                : 'Business pins are now disabled platform-wide (Google Places display cost paused).');
    }

    public function updateCompany(Request $request, Company $company): RedirectResponse
    {
        $admin = auth('admin')->user();

        if (! $admin instanceof Admin) {
            abort(403, 'Unauthorized.');
        }

        $validated = $request->validate([
            'override' => ['required', 'in:inherit,on,off'],
        ]);

        $value = match ($validated['override']) {
            'on' => true,
            'off' => false,
            default => null,
        };

        $this->poiDisplay->setCompanyOverride($company, $value, $admin);

        return redirect()
            ->route('admin.map-display.index', ['q' => $request->query('q')])
            ->with('status', "Business pin setting updated for {$company->name}.");
    }
}
