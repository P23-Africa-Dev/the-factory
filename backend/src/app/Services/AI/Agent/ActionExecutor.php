<?php

declare(strict_types=1);

namespace App\Services\AI\Agent;

use App\Models\ElyActionAudit;
use App\Services\AI\Agent\Tools\ElyTool;
use App\Services\AI\Agent\Tools\ToolContext;
use App\Services\AI\Agent\Tools\ToolKind;
use App\Services\AI\Agent\Tools\ToolRegistry;
use App\Services\AI\Agent\Tools\ToolResult;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Runs a write tool and records it in ely_action_audits, whether it
 * succeeded, failed validation or was refused by a service check. When the
 * tool reports how to reverse itself and the user may run that reverse tool,
 * the undo call is stored on the audit row.
 */
class ActionExecutor
{
    /**
     * @param  array<string, mixed>  $args
     * @return array{ok: bool, result: ?ToolResult, error: ?string, errors: array<string, mixed>, audit_id: ?int, undo_label: ?string}
     */
    public function run(ElyTool $tool, ToolContext $context, array $args, bool $confirmed, ?string $pendingActionId = null): array
    {
        $fail = fn (string $outcome, string $message, array $errors = []): array => [
            'ok' => false,
            'result' => null,
            'error' => $message,
            'errors' => $errors,
            'audit_id' => $this->audit($tool, $context, $args, $outcome, $message, null, $confirmed, $pendingActionId)?->id,
            'undo_label' => null,
        ];

        if (! (bool) config('services.ai.enable_actions', true) && $tool->kind() === ToolKind::Write) {
            return [...$fail('denied', 'ELY actions are currently turned off by the platform administrator.')];
        }

        try {
            $result = $tool->handle($context, $args);
        } catch (ValidationException $e) {
            $errors = $e->errors();
            $first = collect($errors)->flatten()->first();

            return $fail(array_key_exists('authorization', $errors) ? 'denied' : 'failed', is_string($first) ? $first : 'Some details were invalid.', $errors);
        } catch (\Illuminate\Auth\Access\AuthorizationException $e) {
            return $fail('denied', $e->getMessage() !== '' ? $e->getMessage() : 'You are not allowed to do that.');
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException) {
            return $fail('failed', 'That record was not found in your organization.');
        } catch (Throwable $e) {
            report($e);

            return $fail('failed', 'That action could not be completed because of an unexpected error.');
        }

        $undo = $this->allowedUndo($result, $context);
        $audit = $this->audit($tool, $context, $args, 'succeeded', null, $result, $confirmed, $pendingActionId, $undo);

        return [
            'ok' => true,
            'result' => $result,
            'error' => null,
            'errors' => [],
            'audit_id' => $audit?->id,
            'undo_label' => $undo !== null && $audit !== null ? (string) ($undo['label'] ?? 'Undo') : null,
        ];
    }

    /**
     * The reverse call, only if that tool exists and this user may run it.
     *
     * @return array{tool: string, args: array<string, mixed>, label?: string}|null
     */
    private function allowedUndo(ToolResult $result, ToolContext $context): ?array
    {
        if ($result->undo === null) {
            return null;
        }

        $inverse = app(ToolRegistry::class)->get((string) $result->undo['tool']);

        return $inverse !== null && $inverse->allowedFor($context->role) ? $result->undo : null;
    }

    /**
     * @param  array<string, mixed>  $args
     * @param  array<string, mixed>|null  $undo
     */
    private function audit(
        ElyTool $tool,
        ToolContext $context,
        array $args,
        string $outcome,
        ?string $error,
        ?ToolResult $result,
        bool $confirmed,
        ?string $pendingActionId,
        ?array $undo = null,
    ): ?ElyActionAudit {
        try {
            $request = request();

            return ElyActionAudit::query()->create([
                'company_id' => $context->companyId,
                'user_id' => (int) $context->user->id,
                'role' => $context->role,
                'thread_id' => $context->threadId,
                'tool' => $tool->name(),
                'args' => $args,
                'outcome' => $outcome,
                'error' => $error !== null ? mb_substr($error, 0, 2000) : null,
                'result' => $result !== null ? ['summary' => $result->summary, 'payload' => $result->payload, 'link' => $result->link] : null,
                'pending_action_id' => $pendingActionId,
                'confirmed' => $confirmed,
                'undo' => $undo,
                'ip' => $request?->ip(),
                'user_agent' => $request !== null ? mb_substr((string) $request->userAgent(), 0, 255) : null,
            ]);
        } catch (Throwable $e) {
            report($e);

            return null;
        }
    }
}
