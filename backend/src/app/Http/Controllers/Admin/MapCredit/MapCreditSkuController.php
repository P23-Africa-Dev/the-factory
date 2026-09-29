<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\MapCredit;

use App\Http\Controllers\Controller;
use App\Models\MapCreditSku;
use App\Services\Admin\AdminActionLogger;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\View\View;

class MapCreditSkuController extends Controller
{
    public function __construct(
        private readonly AdminActionLogger $actionLogger,
    ) {}

    public function create(): View
    {
        return view('admin.map-credits.skus.create');
    }

    public function store(Request $request): RedirectResponse
    {
        $sku = MapCreditSku::query()->create($this->validated($request, null));
        $this->actionLogger->log('map_credits.sku.created', 'map_credit_sku', (string) $sku->id, [
            'sku' => $sku->sku,
        ]);

        return redirect()
            ->route('admin.map-credits.index')
            ->with('status', 'Map credit SKU created.');
    }

    public function edit(MapCreditSku $sku): View
    {
        return view('admin.map-credits.skus.edit', ['sku' => $sku]);
    }

    public function update(Request $request, MapCreditSku $sku): RedirectResponse
    {
        $sku->update($this->validated($request, $sku));
        $this->actionLogger->log('map_credits.sku.updated', 'map_credit_sku', (string) $sku->id, [
            'sku' => $sku->sku,
        ]);

        return redirect()
            ->route('admin.map-credits.index')
            ->with('status', 'Map credit SKU updated.');
    }

    public function destroy(MapCreditSku $sku): RedirectResponse
    {
        $skuKey = $sku->sku;
        $skuId = (string) $sku->id;
        $sku->delete();
        $this->actionLogger->log('map_credits.sku.deleted', 'map_credit_sku', $skuId, [
            'sku' => $skuKey,
        ]);

        return redirect()
            ->route('admin.map-credits.index')
            ->with('status', 'Map credit SKU deleted.');
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?MapCreditSku $sku): array
    {
        $validated = $request->validate([
            'sku' => ['required', 'string', 'max:64', Rule::unique('map_credit_skus', 'sku')->ignore($sku?->id)],
            'label' => ['required', 'string', 'max:255'],
            'credit_cost' => ['required', 'numeric', 'min:0'],
            'usd_per_1k' => ['nullable', 'numeric', 'min:0'],
            'is_active' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        return [
            'sku' => (string) $validated['sku'],
            'label' => (string) $validated['label'],
            'credit_cost' => (float) $validated['credit_cost'],
            'usd_per_1k' => isset($validated['usd_per_1k']) && $validated['usd_per_1k'] !== null
                ? (float) $validated['usd_per_1k']
                : null,
            'is_active' => $request->boolean('is_active'),
            'sort_order' => (int) ($validated['sort_order'] ?? 0),
        ];
    }
}
