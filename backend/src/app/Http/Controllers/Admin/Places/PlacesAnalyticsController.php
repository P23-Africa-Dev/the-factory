<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Places;

use App\Http\Controllers\Controller;
use App\Models\Admin;
use App\Services\Places\PlacesAnalyticsService;
use App\Services\Places\PlacesSettingsService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class PlacesAnalyticsController extends Controller
{
    public function __construct(
        private readonly PlacesAnalyticsService $analytics,
        private readonly PlacesSettingsService $settings,
    ) {}

    public function index(Request $request): View
    {
        $days = min(90, max(1, $request->integer('days', 7)));

        return view('admin.places.index', [
            'overview' => $this->analytics->overview($days),
            'companies' => $this->analytics->topCompanies($days),
            'events' => $this->analytics->recentEvents(40),
            'days' => $days,
        ]);
    }

    public function updateSettings(Request $request): RedirectResponse
    {
        $admin = auth('admin')->user();
        if (! $admin instanceof Admin) {
            abort(403, 'Unauthorized.');
        }

        $validated = $request->validate([
            'geoapify_enabled' => ['nullable', 'boolean'],
            'foursquare_enabled' => ['nullable', 'boolean'],
            'google_enabled' => ['nullable', 'boolean'],
            'cache_enabled' => ['nullable', 'boolean'],
            'quality_threshold' => ['required', 'numeric', 'min:0.1', 'max:1'],
        ]);

        $this->settings->update([
            'geoapify_enabled' => $request->boolean('geoapify_enabled'),
            'foursquare_enabled' => $request->boolean('foursquare_enabled'),
            'google_enabled' => $request->boolean('google_enabled'),
            'cache_enabled' => $request->boolean('cache_enabled'),
            'quality_threshold' => (float) $validated['quality_threshold'],
        ], $admin);

        return redirect()
            ->route('admin.places.index')
            ->with('success', 'Places search settings updated.');
    }
}
