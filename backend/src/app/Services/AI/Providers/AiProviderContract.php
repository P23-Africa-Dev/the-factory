<?php

declare(strict_types=1);

namespace App\Services\AI\Providers;

use Illuminate\Http\UploadedFile;

interface AiProviderContract
{
    public function generateText(string $systemPrompt, string $userPrompt, array $options = []): ?string;

    public function transcribeAudio(UploadedFile $audio, string $prompt = '', array $options = []): ?string;

    public function isConfigured(): bool;
}
