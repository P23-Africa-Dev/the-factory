<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\AI;

use App\Http\Controllers\Controller;
use App\Models\Admin;
use App\Models\Company;
use App\Models\ElyActionAudit;
use App\Models\PlatformSetting;
use App\Services\AI\Agent\Chat\ChatRouter;
use App\Services\AI\Agent\ElyEngineSelector;
use App\Services\AI\Agent\Tools\ToolKind;
use App\Services\AI\Agent\Tools\ToolRegistry;
use App\Services\AI\AiStackSettingService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\View\View;

/**
 * Platform admin page for ELY's tool-calling engine: which companies use it,
 * whether the active stack can call tools, the tool catalogue, and the audit
 * log of every action ELY ran.
 */
class ElyAgentAdminController extends Controller
{
    public function index(
        Request $request,
        ElyEngineSelector $selector,
        ChatRouter $router,
        AiStackSettingService $stack,
        ToolRegistry $tools,
    ): View {
        $auditsReady = Schema::hasTable('ely_action_audits');

        $audits = null;
        if ($auditsReady) {
            $audits = ElyActionAudit::query()
                ->when($request->filled('company_id'), static fn ($q) => $q->where('company_id', (int) $request->input('company_id')))
                ->when($request->filled('outcome'), static fn ($q) => $q->where('outcome', (string) $request->input('outcome')))
                ->when($request->filled('tool'), static fn ($q) => $q->where('tool', 'like', '%'.(string) $request->input('tool').'%'))
                ->latest('id')
                ->paginate(30)
                ->withQueryString();
        }

        $companyIds = $selector->enabledCompanyIds();
        $companyNames = Company::query()
            ->whereIn('id', array_unique([...$companyIds, ...($audits?->pluck('company_id')->all() ?? [])]))
            ->pluck('name', 'id');

        $toolRows = collect($tools->all())->map(static fn ($tool): array => [
            'name' => $tool->name(),
            'kind' => $tool->kind() === ToolKind::Write ? 'write' : 'read',
            'agent' => $tool->allowedFor('agent'),
            'supervisor' => $tool->allowedFor('supervisor'),
            'admin' => $tool->allowedFor('admin'),
        ])->sortBy('name')->values();

        return view('admin.ai.ely', [
            'engine' => strtolower((string) config('ely.agent.engine', 'legacy')),
            'stack' => $stack->getStack(),
            'canUseTools' => $router->canUseTools(),
            'companyIds' => $companyIds,
            'companyNames' => $companyNames,
            'audits' => $audits,
            'auditsReady' => $auditsReady,
            'toolRows' => $toolRows,
            'canManage' => auth('admin')->user()?->canAccessAbility('manage_ai') === true,
            'disabledTools' => (array) config('ely.agent.disabled_tools', []),
        ]);
    }

    public function updateRollout(Request $request): RedirectResponse
    {
        $admin = auth('admin')->user();
        if (! $admin instanceof Admin) {
            abort(403, 'Unauthorized.');
        }

        $validated = $request->validate([
            'company_ids' => ['nullable', 'string', 'max:2000', 'regex:/^[0-9,\s]*$/'],
        ]);

        $ids = array_values(array_unique(array_filter(array_map(
            static fn (string $id): int => (int) trim($id),
            explode(',', (string) ($validated['company_ids'] ?? '')),
        ))));

        $unknown = array_diff($ids, Company::query()->whereIn('id', $ids)->pluck('id')->map(static fn ($id): int => (int) $id)->all());
        if ($unknown !== []) {
            return back()->withErrors(['company_ids' => 'Unknown company id(s): '.implode(', ', $unknown)])->withInput();
        }

        PlatformSetting::query()->updateOrCreate(
            ['key' => ElyEngineSelector::COMPANY_IDS_KEY],
            ['value' => implode(',', $ids), 'updated_by_admin_id' => $admin->id],
        );
        ElyEngineSelector::forgetCache();

        return redirect()
            ->route('admin.ai.ely')
            ->with('status', $ids === []
                ? 'The ELY tool-calling engine is now off for all individually enabled companies.'
                : 'The ELY tool-calling engine is on for '.count($ids).' company(ies).');
    }
}
