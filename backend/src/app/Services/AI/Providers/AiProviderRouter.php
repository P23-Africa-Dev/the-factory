<?php

declare(strict_types=1);

namespace App\Services\AI\Providers;

use App\Services\AI\Admin\AiFailoverTracker;
use App\Services\AI\AiLoggingService;
use App\Services\Demo\DemoAiResponseService;
use App\Services\Demo\DemoCompanyService;
use Illuminate\Http\UploadedFile;

class AiProviderRouter
{
    public function __construct(
        private readonly OpenAiProvider $openAiProvider,
        private readonly ClaudeProvider $claudeProvider,
        private readonly AiFailoverTracker $failoverTracker,
        private readonly DemoCompanyService $demoCompanyService,
        private readonly DemoAiResponseService $demoAiResponseService,
        private readonly AiLoggingService $aiLoggingService,
    ) {}

    public function generateText(string $systemPrompt, string $userPrompt, array $options = []): ?AiGenerationResult
    {
        $demoResponse = $this->maybeDemoResponse('operational', $systemPrompt, $userPrompt, $options);
        if ($demoResponse !== null) {
            return $this->finalizeInvocation($demoResponse, $options);
        }

        return $this->finalizeInvocation(
            $this->tryProviders(
                $this->orderedProviders(),
                'operational',
                fn (AiProviderContract $provider) => $provider->generateText($systemPrompt, $userPrompt, $options),
            ),
            $options,
        );
    }

    public function generateForPurpose(
        string $purpose,
        string $systemPrompt,
        string $userPrompt,
        array $options = [],
    ): ?AiGenerationResult {
        $purpose = strtolower(trim($purpose));

        $demoResponse = $this->maybeDemoResponse($purpose, $systemPrompt, $userPrompt, $options);
        if ($demoResponse !== null) {
            return $this->finalizeInvocation($demoResponse, $options);
        }

        $model = $this->resolveModelForPurpose($purpose);
        $providers = $this->orderedProvidersForPurpose($purpose);

        return $this->finalizeInvocation(
            $this->tryProviders(
                $providers,
                $purpose,
                fn (AiProviderContract $provider) => $provider->generateText(
                    $systemPrompt,
                    $userPrompt,
                    array_merge($options, ['model' => $model, 'purpose' => $purpose]),
                ),
            ),
            $options,
        );
    }

    private function resolveModelForPurpose(string $purpose): string
    {
        return match ($purpose) {
            'analyst', 'report' => (string) config('services.ai.analyst_model', 'auto'),
            default => (string) config('services.ai.exec_model', config('services.ai.default_model', 'auto')),
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
        } elseif ($provider === 'openai') {
            $model = app(OpenAiModelResolver::class)->resolve($purpose, $model);
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

    public function transcribeAudio(UploadedFile $audio, string $prompt = '', array $options = []): ?AiGenerationResult
    {
        return $this->finalizeInvocation(
            $this->tryProviders(
                $this->orderedProviders(),
                (string) ($options['purpose'] ?? 'operational'),
                fn (AiProviderContract $provider) => $provider->transcribeAudio($audio, $prompt, $options),
            ),
            $options,
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
    private function tryProviders(array $providers, string $purpose, callable $callback): ?AiGenerationResult
    {
        $lastFailedProvider = null;

        foreach ($providers as $provider) {
            if (! $provider->isConfigured()) {
                continue;
            }

            $result = $callback($provider);
            if ($result instanceof AiGenerationResult && $result->isSuccessful()) {
                $resolved = $result->withPurpose($purpose);
                if ($lastFailedProvider !== null) {
                    $this->failoverTracker->record(
                        $lastFailedProvider,
                        $this->providerKey($provider),
                    );

                    return $resolved->withFailoverFrom($lastFailedProvider);
                }

                return $resolved;
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

        foreach ($map as $candidate) {
            if (! in_array($candidate, $ordered, true)) {
                $ordered[] = $candidate;
            }
        }

        return $ordered;
    }

    private function maybeDemoResponse(string $purpose, string $systemPrompt, string $userPrompt, array $options): ?AiGenerationResult
    {
        $companyId = isset($options['company_id']) ? (int) $options['company_id'] : null;
        if ($companyId === null || $companyId <= 0 || ! $this->demoCompanyService->isDemo($companyId)) {
            return null;
        }

        $text = $this->demoAiResponseService->respond($purpose, $systemPrompt, $userPrompt, $options);
        if (! is_string($text) || trim($text) === '') {
            return null;
        }

        return new AiGenerationResult(
            text: trim($text),
            provider: 'demo',
            model: 'mock-ely',
            purpose: $purpose,
            inputTokens: 0,
            outputTokens: 0,
        );
    }

    /**
     * @param  array<string, mixed>  $options
     */
    private function finalizeInvocation(?AiGenerationResult $result, array $options): ?AiGenerationResult
    {
        if ($result === null || ! $result->isSuccessful()) {
            return $result;
        }

        $logContext = $options['_log'] ?? null;
        if (is_array($logContext)) {
            $this->aiLoggingService->recordInvocation($result, $logContext);
        }

        return $result;
    }
}
