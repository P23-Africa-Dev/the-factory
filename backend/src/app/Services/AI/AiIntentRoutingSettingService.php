<?php

declare(strict_types=1);

namespace App\Services\AI;

use App\Models\Admin;
use App\Models\PlatformSetting;
use Illuminate\Support\Facades\Cache;

class AiIntentRoutingSettingService
{
    public const KEY = 'ai.intent_routing';

    public const RULES_FIRST = 'rules_first';

    public const AI_FIRST = 'ai_first';

    private const CACHE_KEY = 'platform_settings.ai_intent_routing';

    public function getMode(): string
    {
        return Cache::rememberForever(self::CACHE_KEY, function (): string {
            $setting = PlatformSetting::query()->where('key', self::KEY)->first();
            $normalized = $this->normalize($setting?->value);

            if ($normalized !== null) {
                return $normalized;
            }

            return $this->defaultMode();
        });
    }

    /**
     * @return array{mode: string, updated_at: ?string}
     */
    public function getSnapshot(): array
    {
        $setting = PlatformSetting::query()->where('key', self::KEY)->first();
        $mode = $this->normalize($setting?->value) ?? $this->defaultMode();

        return [
            'mode' => $mode,
            'updated_at' => $setting?->updated_at?->toIso8601String(),
        ];
    }

    public function setMode(string $mode, Admin $admin): PlatformSetting
    {
        $normalized = $this->normalize($mode) ?? $this->defaultMode();

        $setting = PlatformSetting::query()->updateOrCreate(
            ['key' => self::KEY],
            [
                'value' => $normalized,
                'updated_by_admin_id' => $admin->id,
            ]
        );

        Cache::forever(self::CACHE_KEY, $normalized);

        return $setting;
    }

    public function isAiFirst(): bool
    {
        return $this->getMode() === self::AI_FIRST;
    }

    public function isRulesFirst(): bool
    {
        return $this->getMode() === self::RULES_FIRST;
    }

    private function defaultMode(): string
    {
        return $this->normalize((string) config('services.ai.intent_routing_mode', self::RULES_FIRST))
            ?? self::RULES_FIRST;
    }

    private function normalize(?string $value): ?string
    {
        $normalized = strtolower(trim((string) $value));

        if (in_array($normalized, [self::RULES_FIRST, self::AI_FIRST], true)) {
            return $normalized;
        }

        return null;
    }
}
