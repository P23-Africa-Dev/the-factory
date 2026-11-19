<?php

declare(strict_types=1);

namespace App\Services\AI\Agent;

use App\Models\PlatformSetting;
use App\Services\AI\Agent\Chat\ChatRouter;
use App\Services\Demo\DemoCompanyService;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * Decides whether a company's ELY requests use the tool-calling agent or the
 * legacy rules-first engine.
 *
 * Agent when: (config ely.agent.engine = "agent" OR the company is listed in
 * the platform setting "ely.agent_company_ids"), the company is not a demo
 * company (demo replies are scripted), and the active AI stack can call tools.
 */
class ElyEngineSelector
{
    public const COMPANY_IDS_KEY = 'ely.agent_company_ids';

    private const CACHE_KEY = 'platform_settings.ely_agent_company_ids';

    public function __construct(
        private readonly ChatRouter $chatRouter,
        private readonly DemoCompanyService $demoCompanyService,
    ) {}

    public function useAgent(int $companyId): bool
    {
        $enabled = strtolower((string) config('ely.agent.engine', 'legacy')) === 'agent'
            || in_array($companyId, $this->enabledCompanyIds(), true);

        if (! $enabled) {
            return false;
        }

        if ($this->demoCompanyService->hasComplimentaryAccess($companyId)) {
            return false;
        }

        return $this->chatRouter->canUseTools();
    }

    /**
     * @return array<int, int>
     */
    public function enabledCompanyIds(): array
    {
        try {
            $raw = Cache::remember(self::CACHE_KEY, 300, static fn (): string => (string) (
                PlatformSetting::query()->where('key', self::COMPANY_IDS_KEY)->value('value') ?? ''
            ));
        } catch (Throwable) {
            return [];
        }

        return array_values(array_filter(array_map(
            static fn (string $id): int => (int) trim($id),
            explode(',', (string) $raw),
        )));
    }

    public static function forgetCache(): void
    {
        Cache::forget(self::CACHE_KEY);
    }
}
