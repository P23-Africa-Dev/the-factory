<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdateMapProviderRequest;
use App\Models\Admin;
use App\Services\Map\MapProviderSettingService;
use Illuminate\Http\RedirectResponse;

class MapProviderSettingController extends Controller
{
    public function __construct(private readonly MapProviderSettingService $mapProviderSettingService) {}

    public function update(UpdateMapProviderRequest $request): RedirectResponse
    {
        $admin = auth('admin')->user();

        if (! $admin instanceof Admin) {
            abort(403, 'Unauthorized.');
        }

        $this->mapProviderSettingService->setProvider(
            provider: (string) $request->validated('provider'),
            admin: $admin,
        );

        return redirect()
            ->route('admin.dashboard')
            ->with('status', 'Map provider updated successfully.');
    }
}
