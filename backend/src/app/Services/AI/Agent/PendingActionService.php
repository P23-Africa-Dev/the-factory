<?php

declare(strict_types=1);

namespace App\Services\AI\Agent;

use App\Models\ElyPendingAction;
use App\Services\AI\ActionFieldCatalog;
use App\Services\AI\Agent\Tools\Legacy\LegacyActionTool;
use App\Services\AI\Agent\Tools\ToolContext;
use App\Services\AI\Agent\Tools\ToolRegistry;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Actions ELY prepared that wait for the user's Confirm.
 *
 * A pending action only runs for the same user and company that created it,
 * before it expires, once. Edited arguments from the confirmation card are
 * limited to the tool's editable fields and re-validated by the tool.
 */
class PendingActionService
{
    public function __construct(
        private readonly ToolRegistry $tools,
        private readonly ActionExecutor $executor,
    ) {}

    /**
     * @param  array<string, mixed>  $args
     */
    public function create(ToolContext $context, string $threadId, string $tool, array $args, ?string $toolCallId): ElyPendingAction
    {
        // One open action per thread: a new proposal replaces the old one.
        ElyPendingAction::query()
            ->where('thread_id', $threadId)
            ->where('status', ElyPendingAction::STATUS_PENDING)
            ->update(['status' => ElyPendingAction::STATUS_CANCELLED, 'resolved_at' => now()]);

        return ElyPendingAction::query()->create([
            'id' => (string) Str::ulid(),
            'thread_id' => $threadId,
            'company_id' => $context->companyId,
            'user_id' => (int) $context->user->id,
            'tool' => $tool,
            'args' => $args,
            'args_hash' => self::hash($args),
            'version' => 1,
            'status' => ElyPendingAction::STATUS_PENDING,
            'tool_call_id' => $toolCallId,
            'expires_at' => now()->addHours((int) config('ely.agent.pending_action_ttl_hours', 24)),
        ]);
    }

    public function openForThread(ToolContext $context, string $threadId): ?ElyPendingAction
    {
        return ElyPendingAction::query()
            ->where('thread_id', $threadId)
            ->where('company_id', $context->companyId)
            ->where('user_id', $context->user->id)
            ->where('status', ElyPendingAction::STATUS_PENDING)
            ->where('expires_at', '>', now())
            ->latest('created_at')
            ->first();
    }

    public function find(ToolContext $context, string $pendingId): ElyPendingAction
    {
        $pending = ElyPendingAction::query()
            ->where('id', $pendingId)
            ->where('company_id', $context->companyId)
            ->where('user_id', $context->user->id)
            ->first();

        if ($pending === null) {
            throw ValidationException::withMessages([
                'pending_action' => ['That action was not found.'],
            ]);
        }

        return $pending;
    }

    /**
     * @param  array<string, mixed>  $editedArgs  values from the confirmation card
     * @return array{ok: bool, pending: ElyPendingAction, summary: string, payload: array<string, mixed>, errors: array<string, mixed>}
     */
    public function confirm(ToolContext $context, ElyPendingAction $pending, array $editedArgs = []): array
    {
        $claimed = DB::transaction(function () use ($pending): bool {
            $locked = ElyPendingAction::query()->whereKey($pending->id)->lockForUpdate()->first();
            if ($locked === null || ! $locked->isOpen()) {
                return false;
            }
            $locked->forceFill(['status' => ElyPendingAction::STATUS_CONFIRMED, 'resolved_at' => now()])->save();

            return true;
        });

        $pending->refresh();

        if (! $claimed) {
            $state = $pending->status === ElyPendingAction::STATUS_PENDING ? 'expired' : $pending->status;

            return [
                'ok' => false,
                'pending' => $pending,
                'summary' => "This action can no longer be confirmed (it is {$state}). Ask me again if you still want it.",
                'payload' => ['error' => true, 'pending_action_id' => $pending->id, 'status' => $state],
                'errors' => [],
            ];
        }

        $tool = $this->tools->get($pending->tool);
        if ($tool === null || ! $tool->allowedFor($context->role)) {
            $pending->forceFill(['status' => ElyPendingAction::STATUS_FAILED])->save();

            return [
                'ok' => false,
                'pending' => $pending,
                'summary' => 'You are not permitted to run this action.',
                'payload' => ['error' => true, 'denied' => true, 'tool' => $pending->tool],
                'errors' => [],
            ];
        }

        $args = $this->mergeEdits($pending->tool, (array) $pending->args, $editedArgs);
        $outcome = $this->executor->run($tool, $context, $args, confirmed: true, pendingActionId: (string) $pending->id);

        if (! $outcome['ok']) {
            // Let the user fix the details and try again.
            $pending->forceFill([
                'status' => ElyPendingAction::STATUS_PENDING,
                'resolved_at' => null,
                'args' => $args,
                'args_hash' => self::hash($args),
                'version' => (int) $pending->version + 1,
                'result' => ['error' => $outcome['error'], 'errors' => $outcome['errors']],
            ])->save();

            return [
                'ok' => false,
                'pending' => $pending,
                'summary' => 'I could not complete that action: '.$outcome['error'].' Fix the details and confirm again.',
                'payload' => [
                    'error' => true,
                    'confirmation_required' => true,
                    'pending_action_id' => $pending->id,
                    'tool' => $pending->tool,
                    'action_args' => $args,
                    'validation_errors' => $outcome['errors'],
                ],
                'errors' => $outcome['errors'],
            ];
        }

        $result = $outcome['result'];
        $pending->forceFill(['result' => ['summary' => $result?->summary, 'payload' => $result?->payload]])->save();

        return [
            'ok' => true,
            'pending' => $pending,
            'summary' => (string) ($result?->summary ?? 'Done.'),
            'payload' => [
                ...($result?->payload ?? []),
                'tool' => $pending->tool,
                'pending_action_id' => $pending->id,
                'executed' => true,
                'engine' => 'agent',
                'receipts' => [[
                    'tool' => $pending->tool,
                    'summary' => (string) $result?->summary,
                    'link' => $result?->link,
                    'audit_id' => $outcome['audit_id'],
                    'undo_label' => $outcome['undo_label'],
                ]],
            ],
            'errors' => [],
        ];
    }

    public function cancel(ElyPendingAction $pending): ElyPendingAction
    {
        if ($pending->status === ElyPendingAction::STATUS_PENDING) {
            $pending->forceFill(['status' => ElyPendingAction::STATUS_CANCELLED, 'resolved_at' => now()])->save();
        }

        return $pending;
    }

    /**
     * Args to show on the confirmation card, with the same defaults the
     * action will use.
     *
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    public function prepareArgs(string $toolName, ToolContext $context, array $args): array
    {
        $tool = $this->tools->get($toolName);

        return $tool instanceof LegacyActionTool ? $tool->prepare($context, $args) : $args;
    }

    /**
     * @param  array<string, mixed>  $original
     * @param  array<string, mixed>  $edits
     * @return array<string, mixed>
     */
    private function mergeEdits(string $tool, array $original, array $edits): array
    {
        unset($edits['company_id'], $edits['draft_id'], $edits['draft_version'], $edits['pending_action_id']);
        if ($edits === []) {
            return $original;
        }

        $catalog = ActionFieldCatalog::forTool($tool);
        $allowed = array_merge($catalog['editable'], $catalog['preserve_hidden'] ?? []);
        if ($allowed === []) {
            // Tools without a legacy field catalog: any field in their schema
            // (the tool re-validates and re-checks company scope on run).
            $allowed = array_keys((array) ($this->tools->get($tool)?->inputSchema()['properties'] ?? []));
        }
        if ($allowed === []) {
            return $original;
        }

        // Card field names that differ from the tool's argument names.
        if (isset($edits['to_email']) && is_string($edits['to_email']) && trim($edits['to_email']) !== '') {
            $edits['to'] = [['email' => trim($edits['to_email'])]];
            $allowed[] = 'to';
        }

        foreach ($edits as $key => $value) {
            if (in_array($key, $allowed, true)) {
                $original[$key] = $value;
            }
        }

        return $original;
    }

    /**
     * @param  array<string, mixed>  $args
     */
    public static function hash(array $args): string
    {
        return hash('sha256', (string) json_encode($args));
    }
}
