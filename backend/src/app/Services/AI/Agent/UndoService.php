<?php

declare(strict_types=1);

namespace App\Services\AI\Agent;

use App\Models\ElyActionAudit;
use App\Services\AI\Agent\Tools\ToolContext;
use App\Services\AI\Agent\Tools\ToolRegistry;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Reverses an action ELY ran, by running the reverse call stored on its audit
 * row (e.g. delete the lead it created) as the same user, so the usual
 * permission checks apply. Only the user who ran it can undo it, once, within
 * the undo window.
 */
class UndoService
{
    public const WINDOW_HOURS = 24;

    public function __construct(
        private readonly ToolRegistry $tools,
        private readonly ActionExecutor $executor,
    ) {}

    /**
     * @return array{ok: bool, summary: string, audit: ElyActionAudit}
     */
    public function undo(ToolContext $context, int $auditId): array
    {
        $audit = ElyActionAudit::query()
            ->where('id', $auditId)
            ->where('company_id', $context->companyId)
            ->where('user_id', $context->user->id)
            ->first();

        if ($audit === null || ! is_array($audit->undo) || $audit->outcome !== 'succeeded') {
            throw ValidationException::withMessages(['undo' => ['There is nothing to undo for that action.']]);
        }

        if ($audit->created_at !== null && $audit->created_at->lt(now()->subHours(self::WINDOW_HOURS))) {
            throw ValidationException::withMessages(['undo' => ['That action is too old to undo here. Change it in the app instead.']]);
        }

        $claimed = DB::transaction(static function () use ($audit): bool {
            $locked = ElyActionAudit::query()->whereKey($audit->id)->lockForUpdate()->first();
            if ($locked === null || $locked->undone_at !== null) {
                return false;
            }
            $locked->forceFill(['undone_at' => now()])->save();

            return true;
        });

        if (! $claimed) {
            return ['ok' => false, 'summary' => 'That action was already undone.', 'audit' => $audit->refresh()];
        }

        $tool = $this->tools->get((string) ($audit->undo['tool'] ?? ''));
        if ($tool === null || ! $tool->allowedFor($context->role)) {
            $audit->forceFill(['undone_at' => null])->save();

            return ['ok' => false, 'summary' => 'You are not permitted to undo this action.', 'audit' => $audit];
        }

        $outcome = $this->executor->run($tool, $context, (array) ($audit->undo['args'] ?? []), confirmed: true);
        if (! $outcome['ok']) {
            $audit->forceFill(['undone_at' => null])->save();

            return ['ok' => false, 'summary' => 'I could not undo that: '.$outcome['error'], 'audit' => $audit];
        }

        return ['ok' => true, 'summary' => 'Undone. '.(string) $outcome['result']?->summary, 'audit' => $audit];
    }
}
