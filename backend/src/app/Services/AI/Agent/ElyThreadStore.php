<?php

declare(strict_types=1);

namespace App\Services\AI\Agent;

use App\Models\ElyMessage;
use App\Models\ElyThread;
use App\Services\AI\Agent\Chat\ChatMessage;
use App\Services\AI\Agent\Chat\ToolCall;
use App\Services\AI\Context\ConversationMemoryService;
use Illuminate\Support\Str;

/**
 * Durable conversation storage for the agent engine, including tool calls and
 * tool results, so the model sees exactly what happened in earlier turns.
 *
 * The user-visible turns are mirrored into ConversationMemoryService so the
 * existing thread list, search and history endpoints keep working unchanged.
 */
class ElyThreadStore
{
    public function __construct(
        private readonly ConversationMemoryService $memory,
    ) {}

    public function ensureThread(int $companyId, int $userId, ?string $threadId, string $firstMessage): ElyThread
    {
        if (is_string($threadId) && $threadId !== '') {
            $existing = ElyThread::query()
                ->where('id', $threadId)
                ->where('company_id', $companyId)
                ->where('user_id', $userId)
                ->first();
            if ($existing !== null) {
                return $existing;
            }
        }

        return ElyThread::query()->create([
            'id' => is_string($threadId) && $threadId !== '' ? $threadId : (string) Str::uuid(),
            'company_id' => $companyId,
            'user_id' => $userId,
            'title' => Str::limit(trim($firstMessage), 120, ''),
            'last_message_at' => now(),
        ]);
    }

    public function findThread(int $companyId, int $userId, ?string $threadId): ?ElyThread
    {
        if (! is_string($threadId) || $threadId === '') {
            return null;
        }

        return ElyThread::query()
            ->where('id', $threadId)
            ->where('company_id', $companyId)
            ->where('user_id', $userId)
            ->first();
    }

    /**
     * Model-facing history: the most recent messages, cut so it starts at a
     * user message (never at an orphaned tool result).
     *
     * @return array<int, ChatMessage>
     */
    public function history(ElyThread $thread, int $limit): array
    {
        $rows = ElyMessage::query()
            ->where('thread_id', $thread->id)
            ->orderByDesc('id')
            ->limit(max(2, $limit))
            ->get()
            ->reverse()
            ->values();

        while ($rows->isNotEmpty() && $rows->first()->role !== 'user') {
            $rows->shift();
        }

        return $rows->map(static function (ElyMessage $row): ChatMessage {
            if ($row->role === 'tool') {
                return ChatMessage::toolResult(
                    (string) $row->tool_call_id,
                    (string) $row->tool_name,
                    (string) $row->content,
                    (bool) $row->is_error,
                );
            }

            if ($row->role === 'assistant') {
                $calls = array_map(
                    static fn (array $call): ToolCall => new ToolCall(
                        (string) ($call['id'] ?? ''),
                        (string) ($call['name'] ?? ''),
                        is_array($call['arguments'] ?? null) ? $call['arguments'] : [],
                    ),
                    is_array($row->tool_calls) ? $row->tool_calls : [],
                );

                return ChatMessage::assistant((string) $row->content, $calls);
            }

            return ChatMessage::user((string) $row->content);
        })->all();
    }

    /**
     * @param  array<string, mixed>|null  $payload
     */
    public function appendUser(ElyThread $thread, string $content): void
    {
        $this->store($thread, ['role' => 'user', 'content' => $content]);
        $this->memory->appendMessage((int) $thread->company_id, (int) $thread->user_id, (string) $thread->id, 'user', $content);
    }

    /**
     * Assistant step that requested tools (not shown to the user on its own).
     *
     * @param  array<int, ToolCall>  $toolCalls
     */
    public function appendToolRequest(ElyThread $thread, string $content, array $toolCalls, string $provider, string $model, ?int $inputTokens, ?int $outputTokens): void
    {
        $this->store($thread, [
            'role' => 'assistant',
            'content' => $content,
            'tool_calls' => array_map(static fn (ToolCall $call): array => [
                'id' => $call->id,
                'name' => $call->name,
                'arguments' => $call->arguments,
            ], $toolCalls),
            'provider' => $provider,
            'model' => $model,
            'input_tokens' => $inputTokens,
            'output_tokens' => $outputTokens,
        ]);
    }

    public function appendToolResult(ElyThread $thread, string $toolCallId, string $toolName, string $content, bool $isError): void
    {
        $this->store($thread, [
            'role' => 'tool',
            'content' => $content,
            'tool_call_id' => $toolCallId,
            'tool_name' => $toolName,
            'is_error' => $isError,
        ]);
    }

    /**
     * Final, user-visible assistant reply.
     *
     * @param  array<string, mixed>|null  $payload
     * @param  array<int, string>  $sources
     */
    public function appendAssistant(
        ElyThread $thread,
        string $content,
        ?string $tool,
        array $sources,
        ?array $payload,
        ?string $provider = null,
        ?string $model = null,
        ?int $inputTokens = null,
        ?int $outputTokens = null,
    ): void {
        $this->store($thread, [
            'role' => 'assistant',
            'content' => $content,
            'payload' => $payload,
            'tool_name' => $tool,
            'provider' => $provider,
            'model' => $model,
            'input_tokens' => $inputTokens,
            'output_tokens' => $outputTokens,
        ]);

        $this->memory->appendMessage(
            companyId: (int) $thread->company_id,
            userId: (int) $thread->user_id,
            threadId: (string) $thread->id,
            role: 'assistant',
            content: $content,
            sources: $sources,
            tool: $tool,
            payload: $payload,
        );
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function store(ElyThread $thread, array $attributes): void
    {
        ElyMessage::query()->create([
            'thread_id' => $thread->id,
            'company_id' => $thread->company_id,
            'user_id' => $thread->user_id,
            ...$attributes,
        ]);

        $thread->forceFill(['last_message_at' => now()])->save();
    }
}
