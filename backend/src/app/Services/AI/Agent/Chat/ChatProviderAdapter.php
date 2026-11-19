<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Chat;

/**
 * Native tool-calling chat for one provider. Text-only paths keep using
 * AiProviderContract::generateText.
 */
interface ChatProviderAdapter
{
    /** Provider key as used by AiProviderHealthService and ai_logs: glm|openai|claude|nvidia. */
    public function key(): string;

    public function isConfigured(): bool;

    /** Whether the configured model can do function/tool calling. */
    public function supportsTools(): bool;

    /**
     * @param  (callable(string): void)|null  $onTextDelta  receives answer text as it is generated,
     *                                                     when the adapter supports streaming
     */
    public function chat(ChatRequest $request, ?callable $onTextDelta = null): ChatResponse;
}
