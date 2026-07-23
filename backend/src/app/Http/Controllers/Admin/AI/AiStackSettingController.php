<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\AI;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdateAiStackRequest;
use App\Models\Admin;
use App\Services\AI\AiStackSettingService;
use Illuminate\Http\RedirectResponse;

class AiStackSettingController extends Controller
{
    public function __construct(private readonly AiStackSettingService $aiStackSettingService) {}

    public function update(UpdateAiStackRequest $request): RedirectResponse
    {
        $admin = auth('admin')->user();

        if (! $admin instanceof Admin) {
            abort(403, 'Unauthorized.');
        }

        $stack = (string) $request->validated('stack');
        $this->aiStackSettingService->setStack($stack, $admin);

        $label = $stack === AiStackSettingService::NVIDIA
            ? 'NVIDIA NIM'
            : 'OpenAI + Claude';

        return redirect()
            ->route('admin.ai.index')
            ->with('status', "ELY AI stack switched to {$label}. Inactive vendors will not be called.");
    }
}
