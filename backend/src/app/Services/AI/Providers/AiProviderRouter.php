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
