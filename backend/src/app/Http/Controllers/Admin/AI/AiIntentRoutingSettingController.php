<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\AI;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdateAiIntentRoutingRequest;
use App\Models\Admin;
use App\Services\AI\AiIntentRoutingSettingService;
use Illuminate\Http\RedirectResponse;

class AiIntentRoutingSettingController extends Controller
{
    public function __construct(private readonly AiIntentRoutingSettingService $intentRoutingSettingService) {}

    public function update(UpdateAiIntentRoutingRequest $request): RedirectResponse
    {
        $admin = auth('admin')->user();

        if (! $admin instanceof Admin) {
            abort(403, 'Unauthorized.');
        }

        $mode = (string) $request->validated('mode');
        $this->intentRoutingSettingService->setMode($mode, $admin);

        $label = $mode === AiIntentRoutingSettingService::AI_FIRST
            ? 'Semantic routing (AI-first)'
            : 'Keyword routing (Rules-first)';

        return redirect()
            ->route('admin.ai.index')
            ->with('status', "ELY intent routing switched to {$label}.");
    }
}
