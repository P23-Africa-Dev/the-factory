<?php

declare(strict_types=1);

namespace App\Services\AI\Providers;

use Illuminate\Http\UploadedFile;

class AiProviderRouter
{
    public function __construct(
        private readonly OpenAiProvider $openAiProvider,
        private readonly ClaudeProvider $claudeProvider,
    ) {}

    public function generateText(string $systemPrompt, string $userPrompt, array $options = []): ?string
    {
        foreach ($this->orderedProviders() as $provider) {
            if (! $provider->isConfigured()) {
                continue;
            }

            $result = $provider->generateText($systemPrompt, $userPrompt, $options);
            if (is_string($result) && trim($result) !== '') {
                return trim($result);
            }
        }

        return null;
    }

    public function generateForPurpose(
        string $purpose,
        string $systemPrompt,
        string $userPrompt,
        array $options = [],
    ): ?string {
        $purpose = strtolower(trim($purpose));
        $model = $this->resolveModelForPurpose($purpose);
        $providers = $this->orderedProvidersForPurpose($purpose);

        foreach ($providers as $provider) {
            if (! $provider->isConfigured()) {
                continue;
            }

            $result = $provider->generateText($systemPrompt, $userPrompt, array_merge($options, ['model' => $model]));
            if (is_string($result) && trim($result) !== '') {
                return trim($result);
            }
        }

        return null;
    }

    private function resolveModelForPurpose(string $purpose): string
    {
        return match ($purpose) {
            'analyst', 'report' => (string) config('services.ai.analyst_model', 'claude-3-5-sonnet-latest'),
            default => (string) config('services.ai.exec_model', config('services.ai.default_model', 'gpt-4.1-mini')),
        };
    }

    /**
     * @return array<int, AiProviderContract>
     */
    private function orderedProvidersForPurpose(string $purpose): array
    {
        if (in_array($purpose, ['analyst', 'report'], true)) {
            $primary = strtolower((string) config('services.ai.fallback_provider', 'claude'));
            $fallback = strtolower((string) config('services.ai.provider', 'openai'));
        } else {
            $primary = strtolower((string) config('services.ai.provider', 'openai'));
            $fallback = strtolower((string) config('services.ai.fallback_provider', 'claude'));
        }

        $map = [
            'openai' => $this->openAiProvider,
            'claude' => $this->claudeProvider,
        ];

        $ordered = [];
        if (isset($map[$primary])) {
            $ordered[] = $map[$primary];
        }
        if ($fallback !== $primary && isset($map[$fallback])) {
            $ordered[] = $map[$fallback];
        }
        foreach ($map as $candidate) {
            if (! in_array($candidate, $ordered, true)) {
                $ordered[] = $candidate;
            }
        }

        return $ordered;
    }

    public function transcribeAudio(UploadedFile $audio, string $prompt = '', array $options = []): ?string
    {
        foreach ($this->orderedProviders() as $provider) {
            if (! $provider->isConfigured()) {
                continue;
            }

            $result = $provider->transcribeAudio($audio, $prompt, $options);
            if (is_string($result) && trim($result) !== '') {
                return trim($result);
            }
        }

        return null;
    }

    /**
     * @return array<int, AiProviderContract>
     */
    private function orderedProviders(): array
    {
        $provider = strtolower((string) config('services.ai.provider', 'openai'));
        $fallback = strtolower((string) config('services.ai.fallback_provider', 'claude'));

        $map = [
            'openai' => $this->openAiProvider,
            'claude' => $this->claudeProvider,
        ];

        $ordered = [];
        if (isset($map[$provider])) {
            $ordered[] = $map[$provider];
        }

        if ($fallback !== $provider && isset($map[$fallback])) {
            $ordered[] = $map[$fallback];
        }

        // Ensure both providers are considered even if config values are unexpected.
        foreach ($map as $candidate) {
            if (! in_array($candidate, $ordered, true)) {
                $ordered[] = $candidate;
            }
        }

        return $ordered;
    }
}
