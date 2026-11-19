<?php

declare(strict_types=1);

namespace Tests\Unit\AI\Agent;

use App\Services\AI\Agent\Chat\ChatMessage;
use App\Services\AI\Agent\Chat\ChatRequest;
use App\Services\AI\Agent\Chat\ClaudeChatAdapter;
use App\Services\AI\Agent\Chat\OpenAiCompatibleChatAdapter;
use App\Services\AI\Agent\Chat\ToolCall;
use App\Services\AI\Agent\Chat\ToolSpec;
use App\Services\AI\Providers\ClaudeModelResolver;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class ChatAdaptersTest extends TestCase
{
    public function test_glm_adapter_sends_tools_and_parses_tool_calls(): void
    {
        config([
            'services.ai.glm.api_key' => 'test-key',
            'services.ai.glm.base_url' => 'https://glm.test/v4',
            'ely.agent.models.glm' => 'glm-5.2',
        ]);

        Http::fake([
            'glm.test/*' => Http::response([
                'model' => 'glm-5.2',
                'choices' => [[
                    'finish_reason' => 'tool_calls',
                    'message' => [
                        'content' => null,
                        'tool_calls' => [[
                            'id' => 'call_1',
                            'type' => 'function',
                            'function' => ['name' => 'crm__create_lead', 'arguments' => '{"name":"Acme Foods"}'],
                        ]],
                    ],
                ]],
                'usage' => ['prompt_tokens' => 120, 'completion_tokens' => 14],
            ]),
        ]);

        $adapter = new OpenAiCompatibleChatAdapter(app(HttpFactory::class), 'glm');
        $response = $adapter->chat($this->request());

        $this->assertFalse($response->isFailure());
        $this->assertCount(1, $response->toolCalls);
        $this->assertSame('crm.create_lead', $response->toolCalls[0]->name);
        $this->assertSame(['name' => 'Acme Foods'], $response->toolCalls[0]->arguments);
        $this->assertSame(120, $response->inputTokens);

        Http::assertSent(function (Request $request): bool {
            $body = $request->data();

            return $request->url() === 'https://glm.test/v4/chat/completions'
                && $body['model'] === 'glm-5.2'
                && $body['tool_choice'] === 'auto'
                && $body['tools'][0]['function']['name'] === 'crm__create_lead'
                && $body['messages'][0]['role'] === 'system'
                // the earlier tool call and its result are replayed in OpenAI format
                && $body['messages'][2]['tool_calls'][0]['function']['name'] === 'crm__top_leads'
                && $body['messages'][3]['role'] === 'tool'
                && $body['messages'][3]['tool_call_id'] === 'prev_1';
        });
    }

    public function test_glm_adapter_reports_http_errors_as_failures(): void
    {
        config(['services.ai.glm.api_key' => 'test-key', 'services.ai.glm.base_url' => 'https://glm.test/v4']);
        Http::fake(['glm.test/*' => Http::response(['error' => ['message' => 'rate limit']], 429)]);

        $response = (new OpenAiCompatibleChatAdapter(app(HttpFactory::class), 'glm'))->chat($this->request());

        $this->assertTrue($response->isFailure());
        $this->assertSame(429, $response->httpStatus);
    }

    public function test_claude_adapter_groups_tool_results_and_parses_tool_use(): void
    {
        config([
            'services.ai.claude.api_key' => 'test-key',
            'services.ai.claude.base_url' => 'https://claude.test/v1',
            'ely.agent.models.claude' => 'claude-opus-5-5',
        ]);

        Http::fake([
            'claude.test/*' => Http::response([
                'model' => 'claude-opus-5-5',
                'stop_reason' => 'tool_use',
                'content' => [
                    ['type' => 'text', 'text' => 'Adding it now.'],
                    ['type' => 'tool_use', 'id' => 'toolu_1', 'name' => 'crm__create_lead', 'input' => ['name' => 'Acme Foods']],
                ],
                'usage' => ['input_tokens' => 300, 'output_tokens' => 20],
            ]),
        ]);

        $adapter = new ClaudeChatAdapter(app(HttpFactory::class), app(ClaudeModelResolver::class));
        $response = $adapter->chat($this->request());

        $this->assertSame('Adding it now.', $response->text);
        $this->assertSame('crm.create_lead', $response->toolCalls[0]->name);

        Http::assertSent(function (Request $request): bool {
            $body = $request->data();

            return $body['model'] === 'claude-opus-5-5'
                && $body['tool_choice'] === ['type' => 'auto']
                && ! array_key_exists('temperature', $body)
                && $body['output_config']['effort'] === 'medium'
                && $body['system'][0]['cache_control']['type'] === 'ephemeral'
                && $body['tools'][0]['input_schema']['type'] === 'object'
                && $body['messages'][1]['content'][0]['type'] === 'tool_use'
                && $body['messages'][2]['role'] === 'user'
                && $body['messages'][2]['content'][0]['type'] === 'tool_result'
                && $body['messages'][2]['content'][0]['tool_use_id'] === 'prev_1';
        });
    }

    public function test_glm_streaming_emits_text_and_assembles_tool_calls(): void
    {
        config(['services.ai.glm.api_key' => 'test-key', 'services.ai.glm.base_url' => 'https://glm.test/v4', 'ely.agent.stream' => true]);

        $events = [
            ['model' => 'glm-5.2', 'choices' => [['delta' => ['content' => 'Let me ']]]],
            ['choices' => [['delta' => ['content' => 'check.']]]],
            ['choices' => [['delta' => ['tool_calls' => [['index' => 0, 'id' => 'call_9', 'function' => ['name' => 'crm__top_leads', 'arguments' => '{"sea']]]]]]],
            ['choices' => [['delta' => ['tool_calls' => [['index' => 0, 'function' => ['arguments' => 'rch":"Acme"}']]]]]]],
            ['choices' => [['delta' => [], 'finish_reason' => 'tool_calls']], 'usage' => ['prompt_tokens' => 50, 'completion_tokens' => 9]],
        ];
        $body = implode('', array_map(static fn (array $e): string => 'data: '.json_encode($e)."\n\n", $events))."data: [DONE]\n\n";
        Http::fake(['glm.test/*' => Http::response($body, 200, ['Content-Type' => 'text/event-stream'])]);

        $chunks = [];
        $response = (new OpenAiCompatibleChatAdapter(app(HttpFactory::class), 'glm'))
            ->chat($this->request(), function (string $chunk) use (&$chunks): void {
                $chunks[] = $chunk;
            });

        $this->assertSame(['Let me ', 'check.'], $chunks);
        $this->assertSame('Let me check.', $response->text);
        $this->assertSame('tool_calls', $response->stopReason);
        $this->assertSame('crm.top_leads', $response->toolCalls[0]->name);
        $this->assertSame(['search' => 'Acme'], $response->toolCalls[0]->arguments);
        $this->assertSame('call_9', $response->toolCalls[0]->id);
        $this->assertSame(50, $response->inputTokens);

        Http::assertSent(static fn (Request $request): bool => $request->data()['stream'] === true);
    }

    public function test_wire_names_round_trip(): void
    {
        $this->assertSame('org__users__create', ToolCall::toWireName('org.users.create'));
        $this->assertSame('org.users.create', ToolCall::fromWireName('org__users__create'));
    }

    private function request(): ChatRequest
    {
        return new ChatRequest(
            systemPrompt: 'You are ELY.',
            messages: [
                ChatMessage::user('Find Acme and add Acme Foods'),
                ChatMessage::assistant('', [new ToolCall('prev_1', 'crm.top_leads', ['search' => 'Acme'])]),
                ChatMessage::toolResult('prev_1', 'crm.top_leads', '{"summary":"0 leads"}'),
            ],
            tools: [new ToolSpec('crm.create_lead', 'Add a lead', [
                'type' => 'object',
                'properties' => ['name' => ['type' => 'string']],
                'required' => ['name'],
            ])],
        );
    }
}
