<?php

declare(strict_types=1);

namespace App\Services\AI\Providers;

use App\Services\AI\Admin\AiFailoverTracker;
use App\Services\AI\Providers\ClaudeModelResolver;
use App\Services\AI\Providers\ClaudeProvider;
use Illuminate\Http\UploadedFile;

class AiProviderRouter
{
    public function __construct(
        private readonly OpenAiProvider $openAiProvider,
        private readonly ClaudeProvider $claudeProvider,
        private readonly AiFailoverTracker $failoverTracker,
    ) {}

    public function generateText(string $systemPrompt, string $userPrompt, array $options = []): ?string
    {
        return $this->tryProviders(
            $this->orderedProviders(),
            fn (AiProviderContract $provider) => $provider->generateText($systemPrompt, $userPrompt, $options),
        );
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

        return $this->tryProviders(
            $providers,
            fn (AiProviderContract $provider) => $provider->generateText(
                $systemPrompt,
                $userPrompt,
                array_merge($options, ['model' => $model, 'purpose' => $purpose]),
            ),
        );
    }

    private function resolveModelForPurpose(string $purpose): string
    {
        return match ($purpose) {
            'analyst', 'report' => (string) config('services.ai.analyst_model', 'auto'),
            default => (string) config('services.ai.exec_model', config('services.ai.default_model', 'gpt-4.1-mini')),
        };
    }

    /**
     * @return array{provider: string, model: string, purpose: string}
     */
    public function routingMetadata(string $purpose): array
    {
        $purpose = strtolower(trim($purpose));
        $providers = $this->orderedProvidersForPurpose($purpose);
        $first = $providers[0] ?? null;
        $provider = match (true) {
            $first instanceof OpenAiProvider => 'openai',
            $first instanceof ClaudeProvider => 'claude',
            default => strtolower((string) config('services.ai.provider', 'openai')),
        };
        $model = $this->resolveModelForPurpose($purpose);
        if ($provider === 'claude') {
            $model = app(ClaudeModelResolver::class)->resolve($purpose, $model);
        }

        return [
            'provider' => $provider,
            'model' => $model,
            'purpose' => $purpose,
        ];
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
        return $this->tryProviders(
            $this->orderedProviders(),
            fn (AiProviderContract $provider) => $provider->transcribeAudio($audio, $prompt, $options),
        );
    }

    public function analyzeDocumentFile(
        UploadedFile $file,
        string $systemPrompt,
        string $userPrompt,
        array $options = [],
    ): ?string {
        if (! $this->openAiProvider->isConfigured()) {
            return null;
        }

        return $this->openAiProvider->analyzeDocumentFile($file, $systemPrompt, $userPrompt, $options);
    }

    /**
     * @param  array<int, AiProviderContract>  $providers
     */
    private function tryProviders(array $providers, callable $callback): ?string
    {
        $lastFailedProvider = null;

        foreach ($providers as $provider) {
            if (! $provider->isConfigured()) {
                continue;
            }

            $result = $callback($provider);
            if (is_string($result) && trim($result) !== '') {
                if ($lastFailedProvider !== null) {
                    $this->failoverTracker->record(
                        $lastFailedProvider,
                        $this->providerKey($provider),
                    );
                }

                return trim($result);
            }

            $lastFailedProvider = $this->providerKey($provider);
        }

        return null;
    }

    private function providerKey(AiProviderContract $provider): string
    {
        return $provider instanceof OpenAiProvider ? 'openai' : 'claude';
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
