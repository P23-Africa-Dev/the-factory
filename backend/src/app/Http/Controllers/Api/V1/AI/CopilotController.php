<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\AI;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Services\AI\CopilotService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Illuminate\Validation\ValidationException;
use Throwable;

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

        $streamRequested = (bool) ($validated['stream'] ?? false);
        $streamingEnabled = (bool) config('services.ai.enable_streaming', true);

        if (! $streamRequested || ! $streamingEnabled) {
            $result = $this->copilotService->chat(
                user: $request->user(),
                message: (string) $validated['message'],
                companyId: $this->resolveCompanyContextId($validated['company_id'] ?? null),
                threadId: isset($validated['thread_id']) ? (string) $validated['thread_id'] : null,
                actionArgs: is_array($validated['action_args'] ?? null) ? $validated['action_args'] : [],
                actionConfirmed: (bool) ($validated['action_confirmed'] ?? false),
                idempotencyKey: isset($validated['idempotency_key']) ? (string) $validated['idempotency_key'] : null,
            );

            return $this->success(
                message: 'Copilot response generated successfully.',
                data: $result,
            );
        }

        // Capture all context needed inside the closure before streaming starts.
        $chatUser = $request->user();
        $chatMessage = (string) $validated['message'];
        $chatCompanyId = $this->resolveCompanyContextId($validated['company_id'] ?? null);
        $chatThreadId = isset($validated['thread_id']) ? (string) $validated['thread_id'] : null;
        $chatActionArgs = is_array($validated['action_args'] ?? null) ? $validated['action_args'] : [];
        $chatActionConfirmed = (bool) ($validated['action_confirmed'] ?? false);
        $chatIdempotencyKey = isset($validated['idempotency_key']) ? (string) $validated['idempotency_key'] : null;

        return response()->stream(
            function () use ($chatUser, $chatMessage, $chatCompanyId, $chatThreadId, $chatActionArgs, $chatActionConfirmed, $chatIdempotencyKey): void {
                try {
                    $result = $this->copilotService->chat(
                        user: $chatUser,
                        message: $chatMessage,
                        companyId: $chatCompanyId,
                        threadId: $chatThreadId,
                        actionArgs: $chatActionArgs,
                        actionConfirmed: $chatActionConfirmed,
                        idempotencyKey: $chatIdempotencyKey,
                    );

                    $content = (string) ($result['response']['content'] ?? '');
                    $chunks = preg_split('/\s+/', trim($content)) ?: [];

                    echo "event: meta\n";
                    echo 'data: ' . $this->encodeSseData(['thread_id' => $result['thread_id']]) . "\n\n";
                    @ob_flush();
                    @flush();

                    foreach ($chunks as $chunk) {
                        if ($chunk === '') {
                            continue;
                        }

                        echo "event: delta\n";
                        echo 'data: ' . $this->encodeSseData(['chunk' => $chunk . ' ']) . "\n\n";
                        @ob_flush();
                        @flush();
                    }

                    echo "event: done\n";
                    echo 'data: ' . $this->encodeSseData([
                        'thread_id' => $result['thread_id'],
                        'message' => $content,
                        'tool' => $result['response']['tool'] ?? null,
                        'sources' => $result['response']['sources'] ?? [],
                        'payload' => $result['response']['payload'] ?? null,
                    ]) . "\n\n";
                    @ob_flush();
                    @flush();
                } catch (ValidationException $e) {
                    $firstError = collect($e->errors())
                        ->flatten()
                        ->filter(static fn(mixed $v): bool => is_string($v) && trim($v) !== '')
                        ->first();

                    $errorMessage = is_string($firstError) ? $firstError : $e->getMessage();

                    $this->emitErrorDone($chatThreadId, 'I could not complete that action because some required details are missing or invalid: ' . $errorMessage);
                } catch (Throwable $e) {
                    $this->emitErrorDone($chatThreadId, 'I was unable to complete that request. Please try again or contact support if the issue persists.');
                }
            },
            200,
            [
                'Content-Type' => 'text/event-stream',
                'Cache-Control' => 'no-cache',
                'Connection' => 'keep-alive',
                'X-Accel-Buffering' => 'no',
            ]
        );
    }

    /**
     * @param array<string,mixed> $data
     */
    private function encodeSseData(array $data): string
    {
        $encoded = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);

        if (is_string($encoded)) {
            return $encoded;
        }

        $fallback = json_encode(['error' => 'Unable to encode SSE payload.']);

        return is_string($fallback) ? $fallback : '{"error":"Unable to encode SSE payload."}';
    }

    private function emitErrorDone(?string $threadId, string $message): void
    {
        echo "event: meta\n";
        echo 'data: ' . $this->encodeSseData(['thread_id' => $threadId ?? '']) . "\n\n";
        @ob_flush();
        @flush();

        echo "event: done\n";
        echo 'data: ' . $this->encodeSseData([
            'thread_id' => $threadId ?? '',
            'message' => $message,
            'tool' => null,
            'sources' => [],
            'payload' => ['error' => true],
        ]) . "\n\n";
        @ob_flush();
        @flush();
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

    public function assignees(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable'],
            'query' => ['nullable', 'string', 'max:120'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:20'],
        ]);

        $items = $this->copilotService->lookupAssignees(
            user: $request->user(),
            companyId: $this->resolveCompanyContextId($validated['company_id'] ?? null),
            query: isset($validated['query']) ? (string) $validated['query'] : null,
            limit: isset($validated['limit']) ? (int) $validated['limit'] : 8,
        );

        return $this->success(
            message: 'Copilot assignees fetched successfully.',
            data: ['items' => $items],
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
