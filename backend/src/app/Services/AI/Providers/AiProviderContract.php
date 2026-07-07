<?php

declare(strict_types=1);

namespace App\Services\AI\Providers;

use Illuminate\Http\UploadedFile;

interface AiProviderContract
{
    public function generateText(string $systemPrompt, string $userPrompt, array $options = []): ?AiGenerationResult;

    public function transcribeAudio(UploadedFile $audio, string $prompt = '', array $options = []): ?AiGenerationResult;

    public function isConfigured(): bool;
}
