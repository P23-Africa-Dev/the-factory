<?php

declare(strict_types=1);

namespace App\Services\AI\Providers;

use App\Services\AI\Admin\AiFailoverTracker;
use App\Services\AI\Admin\AiProviderHealthService;
use App\Services\AI\AiLoggingService;
use App\Services\AI\AiStackSettingService;
use App\Services\Demo\DemoAiResponseService;
use App\Services\Demo\DemoCompanyService;
use Illuminate\Http\UploadedFile;

class AiProviderRouter
{
    public function __construct(
        private readonly OpenAiProvider $openAiProvider,
        private readonly ClaudeProvider $claudeProvider,
        private readonly NvidiaProvider $nvidiaProvider,
        private readonly AiStackSettingService $stackSettingService,
        private readonly AiFailoverTracker $failoverTracker,
        private readonly AiProviderHealthService $healthService,
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
                $this->orderedProviders('operational', $options),
                'operational',
                $options,
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

        $model = $this->resolveModelForPurpose($purpose, $options);
        $mergedOptions = array_merge($options, ['model' => $model, 'purpose' => $purpose]);
        $providers = $this->orderedProviders($purpose, $mergedOptions);

        return $this->finalizeInvocation(
            $this->tryProviders(
                $providers,
                $purpose,
                $mergedOptions,
                fn (AiProviderContract $provider) => $provider->generateText(
                    $systemPrompt,
                    $userPrompt,
                    $mergedOptions,
                ),
            ),
            $mergedOptions,
        );
    }

    /**
     * @param  array<string, mixed>  $options
     */
    private function resolveModelForPurpose(string $purpose, array $options = []): string
    {
        if (isset($options['model']) && is_string($options['model']) && trim($options['model']) !== '' && strtolower($options['model']) !== 'auto') {
            return trim($options['model']);
        }

        if ($this->stackSettingService->isNvidia()) {
            return app(NvidiaModelResolver::class)->resolve($purpose);
        }

        return match ($purpose) {
            'routing' => (string) config('services.ai.router_model', 'auto'),
            'analyst', 'report' => (string) config('services.ai.analyst_model', 'auto'),
            default => (string) config('services.ai.exec_model', config('services.ai.default_model', 'auto')),
        };
    }

    /**
     * @return array{provider: string, model: string, purpose: string, stack: string}
     */
    public function routingMetadata(string $purpose): array
    {
        $purpose = strtolower(trim($purpose));
        $stack = $this->stackSettingService->getStack();
        $providers = $this->orderedProviders($purpose);
        $first = $providers[0] ?? null;
        $provider = $this->providerKey($first ?? $this->openAiProvider);
        $model = $this->resolveModelForPurpose($purpose);

        if ($provider === 'claude') {
            $model = app(ClaudeModelResolver::class)->resolve($purpose, $model);
        } elseif ($provider === 'openai') {
            $model = app(OpenAiModelResolver::class)->resolve($purpose, $model);
        } elseif ($provider === 'nvidia') {
            $model = app(NvidiaModelResolver::class)->resolve($purpose, $model);
        }

        return [
            'provider' => $provider,
            'model' => $model,
            'purpose' => $purpose,
            'stack' => $stack,
        ];
    }

    /**
     * @param  array<string, mixed>  $options
     * @return array<int, AiProviderContract>
     */
    private function orderedProviders(string $purpose, array $options = []): array
    {
        $forced = isset($options['force_provider']) ? strtolower(trim((string) $options['force_provider'])) : '';
        if ($forced === 'openai') {
            return [$this->openAiProvider];
        }
        if ($forced === 'claude') {
            return [$this->claudeProvider];
        }
        if ($forced === 'nvidia') {
            return [$this->nvidiaProvider];
        }

        if ($this->stackSettingService->isNvidia()) {
            if ($forced === '' && $this->healthService->shouldSkipProvider('nvidia')) {
                return [];
            }

            return [$this->nvidiaProvider];
        }

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
        if (isset($map[$primary]) && ! $this->healthService->shouldSkipProvider($primary)) {
            $ordered[] = $map[$primary];
        }
        if ($fallback !== $primary && isset($map[$fallback]) && ! $this->healthService->shouldSkipProvider($fallback)) {
            $ordered[] = $map[$fallback];
        }
        foreach ($map as $key => $candidate) {
            if (! in_array($candidate, $ordered, true) && ! $this->healthService->shouldSkipProvider($key)) {
                $ordered[] = $candidate;
            }
        }

        if ($ordered === []) {
            foreach ($map as $candidate) {
                if (! in_array($candidate, $ordered, true)) {
                    $ordered[] = $candidate;
                }
            }
        }

        return $ordered;
    }

    public function transcribeAudio(UploadedFile $audio, string $prompt = '', array $options = []): ?AiGenerationResult
    {
        if ($this->stackSettingService->isNvidia()) {
            return $this->finalizeInvocation(
                AiGenerationResult::failure(
                    provider: 'nvidia',
                    model: 'unsupported',
                    errorClass: 'not_configured',
                    errorMessage: 'Audio transcription is not available on the NVIDIA stack.',
                    purpose: (string) ($options['purpose'] ?? 'operational'),
                ),
                $options,
            );
        }

        return $this->finalizeInvocation(
            $this->tryProviders(
                $this->orderedProviders((string) ($options['purpose'] ?? 'operational'), $options),
                (string) ($options['purpose'] ?? 'operational'),
                $options,
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
        if ($this->stackSettingService->isNvidia()) {
            return null;
        }

        if (! $this->openAiProvider->isConfigured() || $this->healthService->shouldSkipProvider('openai')) {
            return null;
        }

        return $this->openAiProvider->analyzeDocumentFile($file, $systemPrompt, $userPrompt, $options);
    }

    /**
     * @param  array<int, AiProviderContract>  $providers
     * @param  array<string, mixed>  $options
     */
    private function tryProviders(array $providers, string $purpose, array $options, callable $callback): ?AiGenerationResult
    {
        $lastFailedProvider = null;
        $lastFailureResult = null;
        $attempted = false;

        foreach ($providers as $provider) {
            if (! $provider->isConfigured()) {
                continue;
            }

            $attempted = true;
            $result = $callback($provider);
            if (! $result instanceof AiGenerationResult) {
                $lastFailedProvider = $this->providerKey($provider);
                continue;
            }

            if ($result->isFailure()) {
                $this->healthService->markUnhealthy(
                    $result->provider,
                    (string) $result->errorClass,
                    (string) $result->errorMessage,
                );
                $this->recordProviderFailure($result, $options, $purpose);
                $lastFailedProvider = $this->providerKey($provider);
                $lastFailureResult = $result;
                continue;
            }

            if ($result->isSuccessful()) {
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

        if (! $attempted) {
            if ($this->stackSettingService->isNvidia()) {
                $cached = $this->healthService->cachedStatus('nvidia');
                $status = is_array($cached) ? (string) ($cached['status'] ?? 'timeout') : 'timeout';
                $message = is_array($cached) && is_string($cached['message'] ?? null) && trim((string) $cached['message']) !== ''
                    ? (string) $cached['message']
                    : 'NVIDIA NIM is temporarily unavailable after a recent timeout. Try again shortly, or switch to OpenAI + Claude in Admin → AI.';

                return AiGenerationResult::failure(
                    provider: 'nvidia',
                    model: app(NvidiaModelResolver::class)->resolve($purpose),
                    errorClass: in_array($status, ['timeout', 'unreachable'], true) ? $status : 'unreachable',
                    errorMessage: $message,
                    purpose: $purpose,
                );
            }

            return AiGenerationResult::failure(
                provider: 'none',
                model: 'unconfigured',
                errorClass: 'not_configured',
                errorMessage: 'No AI provider API keys are configured.',
                purpose: $purpose,
            );
        }

        return $lastFailureResult;
    }

    /**
     * @param  array<string, mixed>  $options
     */
    private function recordProviderFailure(AiGenerationResult $result, array $options, string $purpose): void
    {
        $logContext = $options['_log'] ?? null;
        if (! is_array($logContext)) {
            return;
        }

        $this->aiLoggingService->recordFailure(
            provider: $result->provider,
            model: $result->model,
            errorCode: (string) ($result->errorClass ?? 'provider_error'),
            errorMessage: (string) ($result->errorMessage ?? 'Provider request failed.'),
            context: array_merge($logContext, ['routing_purpose' => $purpose]),
        );
    }

    private function providerKey(AiProviderContract $provider): string
    {
        return match (true) {
            $provider instanceof OpenAiProvider => 'openai',
            $provider instanceof ClaudeProvider => 'claude',
            $provider instanceof NvidiaProvider => 'nvidia',
            default => 'unknown',
        };
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
