<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Chat;

use App\Services\AI\Admin\AiProviderHealthService;
use App\Services\AI\AiLoggingService;
use App\Services\AI\AiStackSettingService;
use App\Services\AI\Providers\AiGenerationResult;
use App\Services\AI\Providers\ClaudeModelResolver;
use Illuminate\Http\Client\Factory as HttpFactory;
use Throwable;

/**
 * Picks the tool-calling provider from the platform admin's stack switch
 * (Admin -> AI), with the same health-skip and failover rules as
 * AiProviderRouter, and logs each call to ai_logs.
 *
 *  - glm stack:            GLM only
 *  - nvidia stack:         NVIDIA only (if its model supports tools)
 *  - openai_claude stack:  services.ai.provider first, then the fallback
 */
class ChatRouter
{
    /** @var array<string, ChatProviderAdapter>|null */
    private ?array $adapters = null;

    private ?string $forcedKey = null;

    public function __construct(
        private readonly AiStackSettingService $stackSettingService,
        private readonly AiProviderHealthService $healthService,
        private readonly AiLoggingService $aiLoggingService,
    ) {}

    /**
     * Test seam: replace the adapters (keyed by provider).
     *
     * @param  array<string, ChatProviderAdapter>  $adapters
     */
    public function useAdapters(array $adapters): void
    {
        $this->adapters = $adapters;
    }

    /**
     * Use only this provider, whatever the active stack (eval runs).
     */
    public function forceProvider(string $key): void
    {
        $all = $this->adapters();
        $this->adapters = isset($all[$key]) ? [$key => $all[$key]] : [];
        $this->forcedKey = $key;
    }

    /**
     * True when the active stack has at least one configured provider that
     * can do tool calling. When false, ELY stays on the legacy engine.
     */
    public function canUseTools(): bool
    {
        foreach ($this->orderedAdapters(ignoreHealth: true) as $adapter) {
            if ($adapter->isConfigured() && $adapter->supportsTools()) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $logContext  company_id, user_id, session_id, tool_name
     */
    public function chat(ChatRequest $request, array $logContext = [], ?callable $onTextDelta = null): ChatResponse
    {
        $lastFailure = null;

        foreach ($this->orderedAdapters() as $adapter) {
            if (! $adapter->isConfigured() || ! $adapter->supportsTools()) {
                continue;
            }

            try {
                $response = $adapter->chat($request, $onTextDelta);
            } catch (Throwable $e) {
                $response = ChatResponse::failure($adapter->key(), 'unknown', 'unreachable', $e->getMessage());
            }

            $this->log($response, $request, $logContext);

            if (! $response->isFailure()) {
                return $response;
            }

            $this->healthService->markUnhealthy(
                $response->provider,
                (string) $response->errorClass,
                (string) $response->errorMessage,
            );
            $lastFailure = $response;
        }

        return $lastFailure ?? ChatResponse::failure(
            'none',
            'unconfigured',
            'not_configured',
            'No AI provider with tool calling is configured for the active stack.',
        );
    }

    /**
     * @return array<int, ChatProviderAdapter>
     */
    private function orderedAdapters(bool $ignoreHealth = false): array
    {
        $adapters = $this->adapters();
        $keys = match (true) {
            $this->forcedKey !== null => [$this->forcedKey],
            $this->stackSettingService->isGlm() => ['glm'],
            $this->stackSettingService->isNvidia() => ['nvidia'],
            default => array_values(array_unique([
                strtolower((string) config('services.ai.provider', 'openai')),
                strtolower((string) config('services.ai.fallback_provider', 'claude')),
                'openai',
                'claude',
            ])),
        };

        $ordered = [];
        foreach ($keys as $key) {
            if (! isset($adapters[$key])) {
                continue;
            }
            if (! $ignoreHealth && $this->healthService->shouldSkipProvider($key)) {
                continue;
            }
            $ordered[] = $adapters[$key];
        }

        // When every provider is marked unhealthy, still try them rather than fail outright.
        if ($ordered === [] && ! $ignoreHealth) {
            foreach ($keys as $key) {
                if (isset($adapters[$key])) {
                    $ordered[] = $adapters[$key];
                }
            }
        }

        return $ordered;
    }

    /**
     * @return array<string, ChatProviderAdapter>
     */
    private function adapters(): array
    {
        if ($this->adapters !== null) {
            return $this->adapters;
        }

        $http = app(HttpFactory::class);

        return $this->adapters = [
            'glm' => new OpenAiCompatibleChatAdapter($http, 'glm'),
            'openai' => new OpenAiCompatibleChatAdapter($http, 'openai'),
            'nvidia' => new OpenAiCompatibleChatAdapter($http, 'nvidia'),
            'claude' => new ClaudeChatAdapter($http, app(ClaudeModelResolver::class)),
        ];
    }

    /**
     * @param  array<string, mixed>  $logContext
     */
    private function log(ChatResponse $response, ChatRequest $request, array $logContext): void
    {
        $lastUser = '';
        foreach (array_reverse($request->messages) as $message) {
            if ($message->role === 'user') {
                $lastUser = $message->content;
                break;
            }
        }

        $context = [
            'company_id' => $logContext['company_id'] ?? null,
            'user_id' => $logContext['user_id'] ?? null,
            'session_id' => $logContext['session_id'] ?? null,
            'intent_type' => 'agent',
            'tool_name' => $response->toolCalls !== [] ? $response->toolCalls[0]->name : null,
            'routing_purpose' => $request->purpose,
            'user_prompt' => mb_substr($lastUser, 0, 2000),
        ];

        try {
            if ($response->isFailure()) {
                $this->aiLoggingService->recordFailure(
                    provider: $response->provider,
                    model: $response->model,
                    errorCode: (string) $response->errorClass,
                    errorMessage: (string) $response->errorMessage,
                    context: $context,
                );

                return;
            }

            $this->aiLoggingService->recordInvocation(
                new AiGenerationResult(
                    text: $response->text,
                    provider: $response->provider,
                    model: $response->model,
                    purpose: $request->purpose,
                    inputTokens: $response->inputTokens,
                    outputTokens: $response->outputTokens,
                ),
                $context,
            );
        } catch (Throwable) {
            // Logging must never break a chat turn.
        }
    }
}
