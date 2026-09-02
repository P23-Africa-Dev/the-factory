<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Services\AI\Providers\AiGenerationResult;

final class AiGenerationTestFactory
{
    public static function result(
        string $text,
        string $provider = 'openai',
        string $model = 'gpt-4.1-mini',
        string $purpose = 'operational',
        ?int $inputTokens = 10,
        ?int $outputTokens = 20,
    ): AiGenerationResult {
        return new AiGenerationResult(
            text: $text,
            provider: $provider,
            model: $model,
            purpose: $purpose,
            inputTokens: $inputTokens,
            outputTokens: $outputTokens,
        );
    }
}
