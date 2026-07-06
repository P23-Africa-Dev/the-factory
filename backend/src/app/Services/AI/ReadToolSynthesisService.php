<?php

declare(strict_types=1);

namespace App\Services\AI;

use App\Services\AI\Providers\AiGenerationResult;
use App\Services\AI\Providers\AiProviderRouter;
use App\Services\AI\Support\AiPayloadDisplaySanitizer;

class ReadToolSynthesisService
{
    public function __construct(
        private readonly AiProviderRouter $aiProviderRouter,
        private readonly AiPayloadDisplaySanitizer $payloadDisplaySanitizer,
    ) {}

    /**
     * @param  array<string, mixed>  $toolResult
     */
    public function synthesize(
        string $tool,
        array $toolResult,
        string $userMessage,
        string $role,
        string $companyName,
        int $companyId,
        ?int $userId = null,
    ): ?string {
        if (! (bool) config('services.ai.enable_read_synthesis', true)) {
            return null;
        }

        $payload = $toolResult['payload'] ?? [];
        if (! is_array($payload)) {
            $payload = [];
        }

        $displayPayload = $this->payloadDisplaySanitizer->sanitize($payload);

        $systemPrompt = ElySystemPrompt::readToolSynthesis();
        $userPrompt = sprintf(
            "Company: %s\nRole: %s\nTool: %s\nUser question: %s\nTool summary: %s\nTool payload JSON:\n%s",
            $companyName,
            $role,
            $tool,
            $userMessage,
            (string) ($toolResult['summary'] ?? ''),
            json_encode($displayPayload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT),
        );

        $result = $this->aiProviderRouter->generateForPurpose(
            purpose: 'operational',
            systemPrompt: $systemPrompt,
            userPrompt: $userPrompt,
            options: [
                'company_id' => $companyId,
                'max_tokens' => 700,
                'temperature' => 0.2,
                '_log' => [
                    'company_id' => $companyId,
                    'user_id' => $userId,
                    'intent_type' => 'tool',
                    'tool_name' => $tool,
                    'routing_purpose' => 'operational',
                    'user_prompt' => mb_substr($userMessage, 0, 10000),
                ],
            ],
        );

        if ($result instanceof AiGenerationResult && $result->isSuccessful()) {
            return trim((string) $result->text);
        }

        return null;
    }
}
