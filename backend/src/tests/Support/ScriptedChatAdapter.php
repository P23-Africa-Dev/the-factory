<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Services\AI\Agent\Chat\ChatProviderAdapter;
use App\Services\AI\Agent\Chat\ChatRequest;
use App\Services\AI\Agent\Chat\ChatResponse;
use App\Services\AI\Agent\Chat\ToolCall;

/**
 * A fake tool-calling provider that replays scripted model turns, so agent
 * tests run without network calls. Every request it receives is recorded.
 */
final class ScriptedChatAdapter implements ChatProviderAdapter
{
    /** @var array<int, ChatRequest> */
    public array $requests = [];

    /** @var array<int, ChatResponse> */
    private array $script = [];

    public function __construct(private readonly string $providerKey = 'openai') {}

    /**
     * Queue a model turn that calls tools.
     *
     * @param  array<int, array{0: string, 1: array<string, mixed>}>  $calls  [[name, args], ...]
     */
    public function callsTools(array $calls, string $text = ''): self
    {
        $toolCalls = [];
        foreach ($calls as $index => [$name, $args]) {
            $toolCalls[] = new ToolCall('call_'.count($this->script).'_'.$index, $name, $args);
        }
        $this->script[] = new ChatResponse($text, $toolCalls, 'tool_calls', $this->providerKey, 'scripted-model', 10, 5);

        return $this;
    }

    /** Queue a final text answer. */
    public function answers(string $text): self
    {
        $this->script[] = new ChatResponse($text, [], 'stop', $this->providerKey, 'scripted-model', 10, 5);

        return $this;
    }

    public function key(): string
    {
        return $this->providerKey;
    }

    public function isConfigured(): bool
    {
        return true;
    }

    public function supportsTools(): bool
    {
        return true;
    }

    public function chat(ChatRequest $request, ?callable $onTextDelta = null): ChatResponse
    {
        $this->requests[] = $request;

        $response = array_shift($this->script)
            ?? new ChatResponse('(script exhausted)', [], 'stop', $this->providerKey, 'scripted-model');

        // Stream final answers in two pieces, like a real streaming provider.
        if ($onTextDelta !== null && $response->toolCalls === [] && $response->text !== '') {
            $half = intdiv(mb_strlen($response->text), 2);
            $onTextDelta(mb_substr($response->text, 0, $half));
            $onTextDelta(mb_substr($response->text, $half));
        }

        return $response;
    }

    /**
     * Names of the tools offered on the given request.
     *
     * @return array<int, string>
     */
    public function offeredTools(int $requestIndex = 0): array
    {
        return array_map(static fn ($spec): string => $spec->name, $this->requests[$requestIndex]->tools ?? []);
    }
}
