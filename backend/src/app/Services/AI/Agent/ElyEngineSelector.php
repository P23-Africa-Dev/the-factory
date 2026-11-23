<?php

declare(strict_types=1);

namespace App\Services\AI\Agent;

use App\Models\PlatformSetting;
use App\Services\AI\Agent\Chat\ChatRouter;
use App\Services\Demo\DemoCompanyService;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * Decides whether a company's ELY requests use the tool-calling agent (the
 * new ELY) or the legacy rules-first engine.
 *
 * The global engine comes from the platform setting "ely.engine" (set on the
 * admin page, no redeploy) or, when that is not set, from ELY_ENGINE (default
 * "agent"). Per-company exceptions:
 *  - "ely.legacy_company_ids": kept on legacy while the global engine is agent;
 *  - "ely.agent_company_ids":  moved to agent while the global engine is legacy.
 *
 * The agent also requires that the company is not a demo company (demo
 * replies are scripted) and that the active AI stack can call tools; when it
 * cannot (e.g. no provider key), ELY falls back to legacy automatically.
 */
class ElyEngineSelector
{
    public const ENGINE_KEY = 'ely.engine';

    public const COMPANY_IDS_KEY = 'ely.agent_company_ids';

    public const LEGACY_COMPANY_IDS_KEY = 'ely.legacy_company_ids';

    public const ENGINES = ['agent', 'legacy'];

    private const CACHE_PREFIX = 'platform_settings.';

    public function __construct(
        private readonly ChatRouter $chatRouter,
        private readonly DemoCompanyService $demoCompanyService,
    ) {}

    public function useAgent(int $companyId): bool
    {
        if (in_array($companyId, $this->legacyCompanyIds(), true)) {
            return false;
        }

        $enabled = $this->globalEngine() === 'agent'
            || in_array($companyId, $this->enabledCompanyIds(), true);

        if (! $enabled) {
            return false;
        }

        if ($this->demoCompanyService->hasComplimentaryAccess($companyId)) {
            return false;
        }

        return $this->chatRouter->canUseTools();
    }

    /** "agent" or "legacy": the admin's setting, else ELY_ENGINE. */
    public function globalEngine(): string
    {
        $setting = strtolower(trim($this->setting(self::ENGINE_KEY)));
        if (in_array($setting, self::ENGINES, true)) {
            return $setting;
        }

        $configured = strtolower(trim((string) config('ely.agent.engine', 'agent')));

        return in_array($configured, self::ENGINES, true) ? $configured : 'agent';
    }

    /** Whether the global engine is set on the admin page (overriding ELY_ENGINE). */
    public function globalEngineIsOverridden(): bool
    {
        return in_array(strtolower(trim($this->setting(self::ENGINE_KEY))), self::ENGINES, true);
    }

    /**
     * Companies moved to the agent while the global engine is legacy.
     *
     * @return array<int, int>
     */
    public function enabledCompanyIds(): array
    {
        return $this->ids(self::COMPANY_IDS_KEY);
    }

    /**
     * Companies kept on legacy while the global engine is agent.
     *
     * @return array<int, int>
     */
    public function legacyCompanyIds(): array
    {
        return $this->ids(self::LEGACY_COMPANY_IDS_KEY);
    }

    public static function forgetCache(): void
    {
        foreach ([self::ENGINE_KEY, self::COMPANY_IDS_KEY, self::LEGACY_COMPANY_IDS_KEY] as $key) {
            Cache::forget(self::CACHE_PREFIX.$key);
        }
    }

    /**
     * @return array<int, int>
     */
    private function ids(string $key): array
    {
        return array_values(array_filter(array_map(
            static fn (string $id): int => (int) trim($id),
            explode(',', $this->setting($key)),
        )));
    }

    private function setting(string $key): string
    {
        try {
            return (string) Cache::remember(self::CACHE_PREFIX.$key, 300, static fn (): string => (string) (
                PlatformSetting::query()->where('key', $key)->value('value') ?? ''
            ));
        } catch (Throwable) {
            return '';
        }
    }
}
