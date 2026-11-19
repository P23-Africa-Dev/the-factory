<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Chat;

use App\Services\AI\Providers\AiProviderHttpError;
use App\Services\AI\Providers\GlmModelResolver;
use App\Services\AI\Providers\NvidiaModelResolver;
use App\Services\AI\Providers\OpenAiModelResolver;
use Illuminate\Http\Client\Factory as HttpFactory;
use Throwable;

/**
 * Tool calling over the OpenAI-style /chat/completions API, shared by GLM
 * (z.ai), OpenAI and NVIDIA NIM. Tool calls arrive as
 * choices[0].message.tool_calls[] with JSON-string arguments.
 */
class OpenAiCompatibleChatAdapter implements ChatProviderAdapter
{
    public function __construct(
        private readonly HttpFactory $http,
        private readonly string $providerKey,
    ) {}

    public function key(): string
    {
        return $this->providerKey;
    }

    public function isConfigured(): bool
    {
        return trim((string) config("services.ai.{$this->providerKey}.api_key")) !== '';
    }

    public function supportsTools(): bool
    {
        // NVIDIA NIM tool support depends on the hosted model, so it is opt-in.
        if ($this->providerKey === 'nvidia') {
            return (bool) config('ely.agent.nvidia_supports_tools', false);
        }

        return true;
    }

    public function chat(ChatRequest $request, ?callable $onTextDelta = null): ChatResponse
    {
        if ($onTextDelta !== null && (bool) config('ely.agent.stream', true)) {
            return $this->streamChat($request, $onTextDelta);
        }

        $model = $this->resolveModel($request);

        if (! $this->isConfigured()) {
            return ChatResponse::failure($this->providerKey, $model, 'not_configured', "No {$this->providerKey} API key configured.");
        }

        $payload = $this->payload($request, $model);
        $timeoutMs = $this->timeoutMs($request);

        try {
            $response = $this->http
                ->timeout(max(1, (int) ceil($timeoutMs / 1000)))
                ->connectTimeout(15)
                ->withToken((string) config("services.ai.{$this->providerKey}.api_key"))
                ->post($this->baseUrl().'/chat/completions', $payload);
        } catch (Throwable $e) {
            return ChatResponse::failure(
                $this->providerKey,
                $model,
                str_contains(strtolower($e->getMessage()), 'timed out') ? 'timeout' : 'unreachable',
                $e->getMessage(),
            );
        }

        if (! $response->successful()) {
            $classified = AiProviderHttpError::classify($response->status(), (string) $response->json('error.message', ''));

            return ChatResponse::failure(
                $this->providerKey,
                $model,
                $classified['error_class'],
                $classified['error_message'],
                $response->status(),
            );
        }

        $message = $response->json('choices.0.message');
        if (! is_array($message)) {
            return ChatResponse::failure($this->providerKey, $model, 'empty_response', 'The model returned no message.', $response->status());
        }

        $toolCalls = [];
        foreach ((array) ($message['tool_calls'] ?? []) as $index => $call) {
            if (! is_array($call) || ! is_array($call['function'] ?? null)) {
                continue;
            }
            [$arguments, $valid] = ToolCall::decodeArguments($call['function']['arguments'] ?? null);
            $toolCalls[] = new ToolCall(
                id: (string) ($call['id'] ?? ('call_'.$index)),
                name: ToolCall::fromWireName((string) ($call['function']['name'] ?? '')),
                arguments: $arguments,
                argumentsValid: $valid,
            );
        }

        $text = is_string($message['content'] ?? null) ? trim((string) $message['content']) : '';
        $responseModel = $response->json('model');

        return new ChatResponse(
            text: $text,
            toolCalls: $toolCalls,
            stopReason: (string) ($response->json('choices.0.finish_reason') ?? 'stop'),
            provider: $this->providerKey,
            model: is_string($responseModel) && $responseModel !== '' ? $responseModel : $model,
            inputTokens: $this->intOrNull($response->json('usage.prompt_tokens')),
            outputTokens: $this->intOrNull($response->json('usage.completion_tokens')),
        );
    }

    /**
     * Same request with stream: true. Answer text is passed to $onTextDelta as
     * it arrives; tool calls are assembled from their deltas (id and name in
     * the first chunk, arguments split across chunks, keyed by index).
     *
     * @param  callable(string): void  $onTextDelta
     */
    private function streamChat(ChatRequest $request, callable $onTextDelta): ChatResponse
    {
        $model = $this->resolveModel($request);

        if (! $this->isConfigured()) {
            return ChatResponse::failure($this->providerKey, $model, 'not_configured', "No {$this->providerKey} API key configured.");
        }

        $payload = [...$this->payload($request, $model), 'stream' => true];
        if ($this->providerKey === 'openai') {
            $payload['stream_options'] = ['include_usage' => true];
        }

        try {
            $response = $this->http
                ->timeout(max(1, (int) ceil($this->timeoutMs($request) / 1000)))
                ->connectTimeout(15)
                ->withOptions(['stream' => true])
                ->withHeaders(['Accept' => 'text/event-stream'])
                ->withToken((string) config("services.ai.{$this->providerKey}.api_key"))
                ->post($this->baseUrl().'/chat/completions', $payload);
        } catch (Throwable $e) {
            return ChatResponse::failure(
                $this->providerKey,
                $model,
                str_contains(strtolower($e->getMessage()), 'timed out') ? 'timeout' : 'unreachable',
                $e->getMessage(),
            );
        }

        if (! $response->successful()) {
            $classified = AiProviderHttpError::classify($response->status(), (string) $response->json('error.message', ''));

            return ChatResponse::failure($this->providerKey, $model, $classified['error_class'], $classified['error_message'], $response->status());
        }

        $text = '';
        $finish = 'stop';
        $responseModel = $model;
        $inputTokens = null;
        $outputTokens = null;
        /** @var array<int, array{id: string, name: string, arguments: string}> $calls */
        $calls = [];

        $handleEvent = function (string $data) use (&$text, &$finish, &$responseModel, &$inputTokens, &$outputTokens, &$calls, $onTextDelta): void {
            if ($data === '[DONE]') {
                return;
            }
            $event = json_decode($data, true);
            if (! is_array($event)) {
                return;
            }
            if (is_string($event['model'] ?? null) && $event['model'] !== '') {
                $responseModel = $event['model'];
            }
            if (is_array($event['usage'] ?? null)) {
                $inputTokens = $this->intOrNull($event['usage']['prompt_tokens'] ?? null) ?? $inputTokens;
                $outputTokens = $this->intOrNull($event['usage']['completion_tokens'] ?? null) ?? $outputTokens;
            }

            $choice = $event['choices'][0] ?? null;
            if (! is_array($choice)) {
                return;
            }
            if (is_string($choice['finish_reason'] ?? null)) {
                $finish = $choice['finish_reason'];
            }

            $delta = is_array($choice['delta'] ?? null) ? $choice['delta'] : [];
            $chunk = $delta['content'] ?? null;
            if (is_string($chunk) && $chunk !== '') {
                $text .= $chunk;
                $onTextDelta($chunk);
            }

            foreach ((array) ($delta['tool_calls'] ?? []) as $position => $callDelta) {
                if (! is_array($callDelta)) {
                    continue;
                }
                $index = (int) ($callDelta['index'] ?? $position);
                $calls[$index] ??= ['id' => '', 'name' => '', 'arguments' => ''];
                if (is_string($callDelta['id'] ?? null) && $callDelta['id'] !== '') {
                    $calls[$index]['id'] = $callDelta['id'];
                }
                $function = is_array($callDelta['function'] ?? null) ? $callDelta['function'] : [];
                if (is_string($function['name'] ?? null)) {
                    $calls[$index]['name'] .= $function['name'];
                }
                if (is_string($function['arguments'] ?? null)) {
                    $calls[$index]['arguments'] .= $function['arguments'];
                } elseif (is_array($function['arguments'] ?? null)) {
                    $calls[$index]['arguments'] = (string) json_encode($function['arguments']);
                }
            }
        };

        try {
            $body = $response->toPsrResponse()->getBody();
            $buffer = '';
            while (! $body->eof()) {
                $buffer .= $body->read(2048);
                while (($pos = strpos($buffer, "\n")) !== false) {
                    $line = rtrim(substr($buffer, 0, $pos), "\r");
                    $buffer = substr($buffer, $pos + 1);
                    if (str_starts_with($line, 'data:')) {
                        $handleEvent(trim(substr($line, 5)));
                    }
                }
            }
            if (str_starts_with(trim($buffer), 'data:')) {
                $handleEvent(trim(substr(trim($buffer), 5)));
            }
        } catch (Throwable $e) {
            return ChatResponse::failure($this->providerKey, $model, 'unreachable', 'The response stream was interrupted: '.$e->getMessage());
        }

        ksort($calls);
        $toolCalls = [];
        foreach ($calls as $index => $call) {
            if ($call['name'] === '') {
                continue;
            }
            [$arguments, $valid] = ToolCall::decodeArguments($call['arguments']);
            $toolCalls[] = new ToolCall(
                id: $call['id'] !== '' ? $call['id'] : 'call_'.$index,
                name: ToolCall::fromWireName($call['name']),
                arguments: $arguments,
                argumentsValid: $valid,
            );
        }

        return new ChatResponse(
            text: trim($text),
            toolCalls: $toolCalls,
            stopReason: $finish,
            provider: $this->providerKey,
            model: $responseModel,
            inputTokens: $inputTokens,
            outputTokens: $outputTokens,
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(ChatRequest $request, string $model): array
    {
        $payload = [
            'model' => $model,
            'max_tokens' => $request->maxTokens,
            'messages' => $this->toWireMessages($request),
        ];

        if ($request->tools !== []) {
            $payload['tools'] = array_map(static fn (ToolSpec $tool): array => [
                'type' => 'function',
                'function' => [
                    'name' => ToolCall::toWireName($tool->name),
                    'description' => $tool->description,
                    'parameters' => $tool->parameters,
                ],
            ], $request->tools);
            $payload['tool_choice'] = 'auto';
        }

        if ($this->providerKey === 'glm') {
            $thinking = (string) config('ely.agent.glm_thinking', 'enabled');
            $payload['thinking'] = ['type' => $thinking === 'disabled' ? 'disabled' : 'enabled'];
            $payload['temperature'] = (float) config('ely.agent.temperature', 0.3);
        } elseif ($this->providerKey === 'nvidia') {
            $payload['temperature'] = (float) config('ely.agent.temperature', 0.3);
        }

        return $payload;
    }

    private function timeoutMs(ChatRequest $request): int
    {
        return (int) ($request->options['timeout_ms'] ?? config(
            "services.ai.{$this->providerKey}.operational_timeout_ms",
            config('services.ai.request_timeout_ms', 60000),
        ));
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function toWireMessages(ChatRequest $request): array
    {
        $wire = [['role' => 'system', 'content' => $request->systemPrompt]];

        foreach ($request->messages as $message) {
            if ($message->role === 'tool') {
                $wire[] = [
                    'role' => 'tool',
                    'tool_call_id' => (string) $message->toolCallId,
                    'content' => $message->content,
                ];

                continue;
            }

            if ($message->role === 'assistant' && $message->toolCalls !== []) {
                $wire[] = [
                    'role' => 'assistant',
                    'content' => $message->content !== '' ? $message->content : null,
                    'tool_calls' => array_map(static fn (ToolCall $call): array => [
                        'id' => $call->id,
                        'type' => 'function',
                        'function' => [
                            'name' => ToolCall::toWireName($call->name),
                            'arguments' => (string) json_encode((object) $call->arguments, JSON_UNESCAPED_UNICODE),
                        ],
                    ], $message->toolCalls),
                ];

                continue;
            }

            $wire[] = ['role' => $message->role, 'content' => $message->content];
        }

        return $wire;
    }

    private function resolveModel(ChatRequest $request): string
    {
        $requested = isset($request->options['model']) ? (string) $request->options['model'] : '';
        $configured = (string) config("ely.agent.models.{$this->providerKey}", '');
        $model = $requested !== '' ? $requested : ($configured !== '' ? $configured : null);

        return match ($this->providerKey) {
            'glm' => app(GlmModelResolver::class)->resolve('operational', $model),
            'nvidia' => app(NvidiaModelResolver::class)->resolve('operational', $model),
            default => app(OpenAiModelResolver::class)->resolve('default', $model),
        };
    }

    private function baseUrl(): string
    {
        $default = match ($this->providerKey) {
            'glm' => 'https://api.z.ai/api/paas/v4',
            'nvidia' => 'https://integrate.api.nvidia.com/v1',
            default => 'https://api.openai.com/v1',
        };

        return rtrim((string) config("services.ai.{$this->providerKey}.base_url", $default), '/');
    }

    private function intOrNull(mixed $value): ?int
    {
        return is_numeric($value) ? (int) $value : null;
    }
}
