<?php

declare(strict_types=1);

namespace App\Services\AI;

use App\Models\Admin;
use App\Models\PlatformSetting;
use App\Services\AI\Admin\AiProviderHealthService;
use Illuminate\Support\Facades\Cache;

class AiStackSettingService
{
    public const KEY = 'ai.stack';

    public const OPENAI_CLAUDE = 'openai_claude';

    public const NVIDIA = 'nvidia';

    private const CACHE_KEY = 'platform_settings.ai_stack';

    public function __construct(
        private readonly AiProviderHealthService $healthService,
    ) {}

    public function getStack(): string
    {
        return Cache::rememberForever(self::CACHE_KEY, function (): string {
            $setting = PlatformSetting::query()->where('key', self::KEY)->first();
            $normalized = $this->normalize($setting?->value);

            if ($normalized !== null) {
                return $normalized;
            }

            return $this->defaultStack();
        });
    }

    /**
     * @return array{stack: string, updated_at: ?string, nvidia_configured: bool, openai_configured: bool, claude_configured: bool, nvidia_models: array{routing: string, exec: string, analyst: string}}
     */
    public function getSnapshot(): array
    {
        $setting = PlatformSetting::query()->where('key', self::KEY)->first();
        $stack = $this->normalize($setting?->value) ?? $this->defaultStack();

        return [
            'stack' => $stack,
            'updated_at' => $setting?->updated_at?->toIso8601String(),
            'nvidia_configured' => trim((string) config('services.ai.nvidia.api_key')) !== '',
            'openai_configured' => trim((string) config('services.ai.openai.api_key')) !== '',
            'claude_configured' => trim((string) config('services.ai.claude.api_key')) !== '',
            'nvidia_models' => [
                'routing' => (string) config('services.ai.nvidia.routing_model'),
                'exec' => (string) config('services.ai.nvidia.exec_model'),
                'analyst' => (string) config('services.ai.nvidia.analyst_model'),
            ],
        ];
    }

    public function setStack(string $stack, Admin $admin): PlatformSetting
    {
        $previous = $this->getStack();
        $normalized = $this->normalize($stack) ?? $this->defaultStack();

        $setting = PlatformSetting::query()->updateOrCreate(
            ['key' => self::KEY],
            [
                'value' => $normalized,
                'updated_by_admin_id' => $admin->id,
            ]
        );

        Cache::forever(self::CACHE_KEY, $normalized);

        if ($previous !== $normalized) {
            $this->healthService->clearStackHealth($this->inactiveProvidersFor($normalized));
        }

        return $setting;
    }

    public function isNvidia(): bool
    {
        return $this->getStack() === self::NVIDIA;
    }

    public function isOpenAiClaude(): bool
    {
        return $this->getStack() === self::OPENAI_CLAUDE;
    }

    private function defaultStack(): string
    {
        return $this->normalize((string) config('services.ai.stack', self::OPENAI_CLAUDE))
            ?? self::OPENAI_CLAUDE;
    }

    private function normalize(?string $value): ?string
    {
        $normalized = strtolower(trim((string) $value));

        if ($normalized === self::OPENAI_CLAUDE || $normalized === self::NVIDIA) {
            return $normalized;
        }

        return null;
    }

    /**
     * @return array<int, string>
     */
    private function inactiveProvidersFor(string $activeStack): array
    {
        return $activeStack === self::NVIDIA
            ? ['openai', 'claude']
            : ['nvidia'];
    }
}
