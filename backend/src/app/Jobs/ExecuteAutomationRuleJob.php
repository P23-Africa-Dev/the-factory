<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\AiAutomationRule;
use App\Models\User;
use App\Services\AI\Policy\ToolPolicyService;
use App\Services\AI\Tools\ActionToolRegistry;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Throwable;

class ExecuteAutomationRuleJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public function __construct(
        public readonly int $ruleId,
        public readonly int $triggeredByUserId,
        public readonly int $companyId,
    ) {}

    public function handle(
        ActionToolRegistry $actionToolRegistry,
        ToolPolicyService $toolPolicyService,
    ): void {
        $rule = AiAutomationRule::query()->find($this->ruleId);
        $user = User::query()->find($this->triggeredByUserId);

        if (! $rule || ! $user) {
            return;
        }

        if ((int) $rule->company_id !== $this->companyId || (string) $rule->status !== 'active') {
            return;
        }

        $membership = $rule->company->users()
            ->where('users.id', $user->id)
            ->first();

        if (! $membership) {
            return;
        }

        $role = (string) ($membership->pivot?->role ?? 'agent');
        if (! $toolPolicyService->canUseTool($role, (string) $rule->action_tool)) {
            return;
        }

        try {
            $actionToolRegistry->execute(
                tool: (string) $rule->action_tool,
                user: $user,
                companyId: $this->companyId,
                args: is_array($rule->action_args) ? $rule->action_args : [],
            );

            $rule->update([
                'last_run_at' => now(),
            ]);
        } catch (Throwable $exception) {
            Log::warning('Automation rule execution failed.', [
                'rule_id' => $this->ruleId,
                'company_id' => $this->companyId,
                'user_id' => $this->triggeredByUserId,
                'exception' => $exception::class,
                'message' => $exception->getMessage(),
            ]);

            throw $exception;
        }
    }
}
