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

        // The picker edits the exception list for the current global engine:
        // with the new engine on, ticked companies stay on the old one; with
        // the old engine on, ticked companies get the new one.
        $globalEngine = $selector->globalEngine();
        $exceptionList = $globalEngine === 'agent' ? 'legacy' : 'agent';
        $companyIds = $exceptionList === 'legacy' ? $selector->legacyCompanyIds() : $selector->enabledCompanyIds();

        // Selectable list for the rollout picker: real (non-demo) companies.
        // Demo companies always stay on legacy, so they are left out.
        $selectableCompanies = Company::query()
            ->where(static fn ($q) => $q->where('is_demo', false)->orWhereNull('is_demo'))
            ->orderBy('name')
            ->limit(2000)
            ->get(['id', 'name', 'status', 'company_id']);

        $companyNames = Company::query()
            ->whereIn('id', array_values(array_unique([...$companyIds, ...($audits?->pluck('company_id')->all() ?? [])])))
            ->pluck('name', 'id')
            ->union($selectableCompanies->pluck('name', 'id'));

        $toolRows = collect($tools->all())->map(static fn ($tool): array => [
            'name' => $tool->name(),
            'kind' => $tool->kind() === ToolKind::Write ? 'write' : 'read',
            'agent' => $tool->allowedFor('agent'),
            'supervisor' => $tool->allowedFor('supervisor'),
            'admin' => $tool->allowedFor('admin'),
        ])->sortBy('name')->values();

        return view('admin.ai.ely', [
            'engine' => $globalEngine,
            'engineOverridden' => $selector->globalEngineIsOverridden(),
            'configEngine' => strtolower((string) config('ely.agent.engine', 'agent')),
            'exceptionList' => $exceptionList,
            'stack' => $stack->getStack(),
            'canUseTools' => $router->canUseTools(),
            'companyIds' => $companyIds,
            'companyNames' => $companyNames,
            'selectableCompanies' => $selectableCompanies,
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

        $request->validate([
            'company_ids' => ['nullable'],
            'company_ids.*' => ['integer'],
            // Which exception list the form edits: "legacy" (keep on the old
            // engine) or "agent" (move to the new engine). Older forms sent
            // no list and meant "agent".
            'list' => ['nullable', 'in:agent,legacy'],
        ]);
        $list = (string) ($request->input('list') ?: 'agent');

        // Accepts the checkbox list (array) and, for compatibility, a
        // comma-separated string.
        $raw = $request->input('company_ids');
        $parts = is_array($raw) ? $raw : explode(',', (string) $raw);
        $ids = array_values(array_unique(array_filter(array_map(
            static fn ($id): int => (int) trim((string) $id),
            $parts,
        ), static fn (int $id): bool => $id > 0)));

        $unknown = array_diff($ids, Company::query()->whereIn('id', $ids)->pluck('id')->map(static fn ($id): int => (int) $id)->all());
        if ($unknown !== []) {
            return back()->withErrors(['company_ids' => 'Unknown company id(s): '.implode(', ', $unknown)])->withInput();
        }

        PlatformSetting::query()->updateOrCreate(
            ['key' => $list === 'legacy' ? ElyEngineSelector::LEGACY_COMPANY_IDS_KEY : ElyEngineSelector::COMPANY_IDS_KEY],
            ['value' => implode(',', $ids), 'updated_by_admin_id' => $admin->id],
        );
        ElyEngineSelector::forgetCache();

        $status = match (true) {
            $list === 'legacy' && $ids === [] => 'Every company now uses the new ELY.',
            $list === 'legacy' => count($ids).' company(ies) will stay on the old ELY; everyone else uses the new one.',
            $ids === [] => 'No company is individually moved to the new ELY.',
            default => 'The new ELY is on for '.count($ids).' company(ies).',
        };

        return redirect()->route('admin.ai.ely')->with('status', $status);
    }

    /**
     * Switch the engine for all companies without a redeploy. "default"
     * removes the override so ELY_ENGINE applies again.
     */
    public function updateEngine(Request $request): RedirectResponse
    {
        $admin = auth('admin')->user();
        if (! $admin instanceof Admin) {
            abort(403, 'Unauthorized.');
        }

        $engine = (string) $request->validate([
            'engine' => ['required', 'in:agent,legacy,default'],
        ])['engine'];

        if ($engine === 'default') {
            PlatformSetting::query()->where('key', ElyEngineSelector::ENGINE_KEY)->delete();
        } else {
            PlatformSetting::query()->updateOrCreate(
                ['key' => ElyEngineSelector::ENGINE_KEY],
                ['value' => $engine, 'updated_by_admin_id' => $admin->id],
            );
        }
        ElyEngineSelector::forgetCache();

        return redirect()->route('admin.ai.ely')->with('status', match ($engine) {
            'agent' => 'Every company now uses the new ELY (except the companies you keep on the old one).',
            'legacy' => 'Every company is back on the old ELY (except the companies you move to the new one).',
            default => 'The engine now follows the server setting (ELY_ENGINE).',
        });
    }
}
