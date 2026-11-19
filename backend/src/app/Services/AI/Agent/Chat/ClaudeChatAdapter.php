<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Chat;

use App\Services\AI\Providers\AiProviderHttpError;
use App\Services\AI\Providers\ClaudeModelResolver;
use Illuminate\Http\Client\Factory as HttpFactory;
use Throwable;

/**
 * Tool calling over the Anthropic Messages API.
 *
 * - Tools are sent as {name, description, input_schema} with tool_choice auto
 *   (forced tool_choice is rejected by current models).
 * - Tool results for one assistant turn go back in a single user message.
 * - The static system prompt carries cache_control so repeated turns reuse it.
 * - No temperature; depth is set with output_config.effort on Claude 5 models.
 */
class ClaudeChatAdapter implements ChatProviderAdapter
{
    public function __construct(
        private readonly HttpFactory $http,
        private readonly ClaudeModelResolver $modelResolver,
    ) {}

    public function key(): string
    {
        return 'claude';
    }

    public function isConfigured(): bool
    {
        return trim((string) config('services.ai.claude.api_key')) !== '';
    }

    public function supportsTools(): bool
    {
        return true;
    }

    public function chat(ChatRequest $request, ?callable $onTextDelta = null): ChatResponse
    {
        $requested = isset($request->options['model']) ? (string) $request->options['model'] : '';
        $configured = (string) config('ely.agent.models.claude', '');
        $model = $this->modelResolver->resolve('default', $requested !== '' ? $requested : ($configured !== '' ? $configured : null));

        if (! $this->isConfigured()) {
            return ChatResponse::failure('claude', $model, 'not_configured', 'No Anthropic API key configured.');
        }

        $payload = [
            'model' => $model,
            'max_tokens' => $request->maxTokens,
            'system' => [[
                'type' => 'text',
                'text' => $request->systemPrompt,
                'cache_control' => ['type' => 'ephemeral'],
            ]],
            'messages' => $this->toWireMessages($request->messages),
        ];

        if ($request->tools !== []) {
            $payload['tools'] = array_map(static fn (ToolSpec $tool): array => [
                'name' => ToolCall::toWireName($tool->name),
                'description' => $tool->description,
                'input_schema' => $tool->parameters,
            ], $request->tools);
            $payload['tool_choice'] = ['type' => 'auto'];
        }

        if (preg_match('/^claude-(opus|sonnet|haiku)-5/', $model) === 1) {
            $payload['output_config'] = ['effort' => (string) config('ely.agent.claude_effort', 'medium')];
        }

        $timeoutMs = (int) ($request->options['timeout_ms'] ?? config('services.ai.request_timeout_ms', 60000));

        try {
            $response = $this->http
                ->timeout(max(1, (int) ceil($timeoutMs / 1000)))
                ->connectTimeout(15)
                ->withHeaders([
                    'x-api-key' => (string) config('services.ai.claude.api_key'),
                    'anthropic-version' => (string) config('services.ai.claude.version', '2023-06-01'),
                ])
                ->post(rtrim((string) config('services.ai.claude.base_url', 'https://api.anthropic.com/v1'), '/').'/messages', $payload);
        } catch (Throwable $e) {
            return ChatResponse::failure(
                'claude',
                $model,
                str_contains(strtolower($e->getMessage()), 'timed out') ? 'timeout' : 'unreachable',
                $e->getMessage(),
            );
        }

        if (! $response->successful()) {
            $classified = AiProviderHttpError::classify($response->status(), (string) $response->json('error.message', ''));

            return ChatResponse::failure('claude', $model, $classified['error_class'], $classified['error_message'], $response->status());
        }

        $stopReason = (string) ($response->json('stop_reason') ?? 'end_turn');
        $text = '';
        $toolCalls = [];

        foreach ((array) $response->json('content', []) as $block) {
            if (! is_array($block)) {
                continue;
            }
            if (($block['type'] ?? null) === 'text') {
                $text .= (string) ($block['text'] ?? '');
            } elseif (($block['type'] ?? null) === 'tool_use') {
                $toolCalls[] = new ToolCall(
                    id: (string) ($block['id'] ?? ''),
                    name: ToolCall::fromWireName((string) ($block['name'] ?? '')),
                    arguments: is_array($block['input'] ?? null) ? $block['input'] : [],
                );
            }
        }

        if ($stopReason === 'refusal' && trim($text) === '') {
            $text = 'I cannot help with that request.';
        }

        $responseModel = $response->json('model');

        return new ChatResponse(
            text: trim($text),
            toolCalls: $toolCalls,
            stopReason: $stopReason,
            provider: 'claude',
            model: is_string($responseModel) && $responseModel !== '' ? $responseModel : $model,
            inputTokens: is_numeric($response->json('usage.input_tokens')) ? (int) $response->json('usage.input_tokens') : null,
            outputTokens: is_numeric($response->json('usage.output_tokens')) ? (int) $response->json('usage.output_tokens') : null,
        );
    }

    /**
     * @param  array<int, ChatMessage>  $messages
     * @return array<int, array<string, mixed>>
     */
    private function toWireMessages(array $messages): array
    {
        $wire = [];
        $pendingResults = [];

        foreach ($messages as $message) {
            if ($message->role === 'tool') {
                $pendingResults[] = [
                    'type' => 'tool_result',
                    'tool_use_id' => (string) $message->toolCallId,
                    'content' => $message->content,
                    'is_error' => $message->isError,
                ];

                continue;
            }

            if ($pendingResults !== []) {
                $wire[] = ['role' => 'user', 'content' => $pendingResults];
                $pendingResults = [];
            }

            if ($message->role === 'assistant') {
                $blocks = [];
                if (trim($message->content) !== '') {
                    $blocks[] = ['type' => 'text', 'text' => $message->content];
                }
                foreach ($message->toolCalls as $call) {
                    $blocks[] = [
                        'type' => 'tool_use',
                        'id' => $call->id,
                        'name' => ToolCall::toWireName($call->name),
                        'input' => (object) $call->arguments,
                    ];
                }
                if ($blocks !== []) {
                    $wire[] = ['role' => 'assistant', 'content' => $blocks];
                }

                continue;
            }

            $wire[] = ['role' => 'user', 'content' => $message->content];
        }

        if ($pendingResults !== []) {
            $wire[] = ['role' => 'user', 'content' => $pendingResults];
        }

        return $wire;
    }
}
