<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\AI;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Services\AI\CopilotService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class CopilotController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(private readonly CopilotService $copilotService) {}

    public function chat(Request $request): JsonResponse|StreamedResponse
    {
        $validated = $request->validate([
            'message' => ['required', 'string', 'max:2000'],
            'company_id' => ['nullable'],
            'thread_id' => ['nullable', 'string', 'max:120'],
            'stream' => ['sometimes', 'boolean'],
            'action_args' => ['sometimes', 'array'],
            'action_confirmed' => ['sometimes', 'boolean'],
            'idempotency_key' => ['nullable', 'string', 'max:120'],
        ]);

        $result = $this->copilotService->chat(
            user: $request->user(),
            message: (string) $validated['message'],
            companyId: $this->resolveCompanyContextId($validated['company_id'] ?? null),
            threadId: isset($validated['thread_id']) ? (string) $validated['thread_id'] : null,
            actionArgs: is_array($validated['action_args'] ?? null) ? $validated['action_args'] : [],
            actionConfirmed: (bool) ($validated['action_confirmed'] ?? false),
            idempotencyKey: isset($validated['idempotency_key']) ? (string) $validated['idempotency_key'] : null,
        );

        $streamRequested = (bool) ($validated['stream'] ?? false);
        $streamingEnabled = (bool) config('services.ai.enable_streaming', true);

        if (! $streamRequested || ! $streamingEnabled) {
            return $this->success(
                message: 'Copilot response generated successfully.',
                data: $result,
            );
        }

        $content = (string) ($result['response']['content'] ?? '');
        $chunks = preg_split('/\s+/', trim($content)) ?: [];

        return response()->stream(function () use ($result, $chunks, $content): void {
            echo "event: meta\n";
            echo 'data: ' . json_encode([
                'thread_id' => $result['thread_id'],
            ]) . "\n\n";
            @ob_flush();
            @flush();

            foreach ($chunks as $chunk) {
                if ($chunk === '') {
                    continue;
                }

                echo "event: delta\n";
                echo 'data: ' . json_encode([
                    'chunk' => $chunk . ' ',
                ]) . "\n\n";
                @ob_flush();
                @flush();
            }

            echo "event: done\n";
            echo 'data: ' . json_encode([
                'thread_id' => $result['thread_id'],
                'message' => $content,
                'tool' => $result['response']['tool'] ?? null,
                'sources' => $result['response']['sources'] ?? [],
                'payload' => $result['response']['payload'] ?? null,
            ]) . "\n\n";
            @ob_flush();
            @flush();
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $threads = $this->copilotService->listThreads(
            user: $request->user(),
            companyId: $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Copilot threads fetched successfully.',
            data: ['items' => $threads],
        );
    }

    public function show(Request $request, string $thread): JsonResponse
    {
        $threadData = $this->copilotService->getThread(
            user: $request->user(),
            threadId: $thread,
            companyId: $this->resolveCompanyContextId($request->input('company_id')),
        );

        if ($threadData === null) {
            return $this->error('Copilot thread was not found.', ['thread' => ['Copilot thread does not exist in your scope.']], 404);
        }

        return $this->success(
            message: 'Copilot thread fetched successfully.',
            data: ['thread' => $threadData],
        );
    }

    public function destroy(Request $request, string $thread): JsonResponse
    {
        $deleted = $this->copilotService->deleteThread(
            user: $request->user(),
            threadId: $thread,
            companyId: $this->resolveCompanyContextId($request->input('company_id')),
        );

        if (! $deleted) {
            return $this->error('Copilot thread was not found.', ['thread' => ['Copilot thread does not exist in your scope.']], 404);
        }

        return $this->success(
            message: 'Copilot thread deleted successfully.',
            data: ['deleted' => true],
        );
    }
}
