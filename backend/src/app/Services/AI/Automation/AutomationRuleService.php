<?php

declare(strict_types=1);

namespace App\Services\AI\Automation;

use App\Models\AiAutomationRule;
use App\Models\User;
use App\Services\AI\Policy\ToolPolicyService;
use App\Services\Company\CompanyContextService;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class AutomationRuleService
{
    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly ToolPolicyService $toolPolicyService,
    ) {}

    public function preview(User $user, string $prompt, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $role = (string) $context['role'];

        $rule = $this->translatePromptToRule($prompt);
        $this->validateRuleForRole($role, $rule['action_tool']);

        return [
            ...$rule,
            'company_id' => (int) $context['company']->id,
            'role' => $role,
        ];
    }

    public function create(User $user, string $prompt, ?string $name = null, ?int $companyId = null): AiAutomationRule
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $role = (string) $context['role'];

        $rule = $this->translatePromptToRule($prompt);
        $this->validateRuleForRole($role, $rule['action_tool']);

        return AiAutomationRule::query()->create([
            'company_id' => $resolvedCompanyId,
            'created_by_user_id' => (int) $user->id,
            'name' => $name && trim($name) !== '' ? trim($name) : 'Automation ' . now()->format('Y-m-d H:i'),
            'prompt' => $prompt,
            'trigger_type' => (string) $rule['trigger_type'],
            'trigger_expression' => Arr::get($rule, 'trigger_expression'),
            'action_tool' => (string) $rule['action_tool'],
            'action_args' => $rule['action_args'] ?? [],
            'status' => 'active',
        ]);
    }

    /**
     * @return array<int, AiAutomationRule>
     */
    public function list(User $user, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);

        return AiAutomationRule::query()
            ->where('company_id', (int) $context['company']->id)
            ->latest('id')
            ->get()
            ->all();
    }

    public function runNow(User $user, AiAutomationRule $rule, ?int $companyId = null): AiAutomationRule
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;

        if ((int) $rule->company_id !== $resolvedCompanyId) {
            throw ValidationException::withMessages([
                'automation' => ['Automation rule does not belong to the active company context.'],
            ]);
        }

        $this->validateRuleForRole((string) $context['role'], (string) $rule->action_tool);

        $jobClass = 'App\\Jobs\\ExecuteAutomationRuleJob';
        dispatch(new $jobClass((int) $rule->id, (int) $user->id, $resolvedCompanyId));

        return $rule;
    }

    private function validateRuleForRole(string $role, string $actionTool): void
    {
        if (! $this->toolPolicyService->canUseTool($role, $actionTool)) {
            throw ValidationException::withMessages([
                'action_tool' => ['The current role is not permitted to execute this automation action tool.'],
            ]);
        }
    }

    private function translatePromptToRule(string $prompt): array
    {
        $normalized = strtolower(trim($prompt));
        $structured = $this->extractStructuredFields($prompt);

        $triggerType = 'manual';
        $triggerExpression = null;

        if (str_contains($normalized, 'every week') || str_contains($normalized, 'weekly')) {
            $triggerType = 'schedule.weekly';
            $triggerExpression = 'weekly:monday:09:00';
        } elseif (str_contains($normalized, 'every day') || str_contains($normalized, 'daily')) {
            $triggerType = 'schedule.daily';
            $triggerExpression = 'daily:09:00';
        } elseif (str_contains($normalized, 'when overdue') || str_contains($normalized, 'if overdue')) {
            $triggerType = 'event.tasks.overdue';
            $triggerExpression = 'tasks.overdue.detected';
        }

        $actionTool = $this->determineActionTool($normalized, $structured['tool'] ?? null);
        $actionArgs = $this->mergeActionArgs(
            actionTool: $actionTool,
            prompt: $prompt,
            structuredArgs: $structured['args'] ?? [],
        );

        $validator = Validator::make(
            ['action_tool' => $actionTool, 'action_args' => $actionArgs],
            [
                'action_tool' => ['required', 'string', 'in:tasks.create,tasks.reassign,meetings.schedule,notifications.send,projects.create'],
            ] + $this->actionValidationRules($actionTool),
        );

        if ($validator->fails()) {
            throw ValidationException::withMessages([
                'prompt' => ['Unable to translate prompt into a valid automation rule. Provide explicit fields like "tool: tasks.create; title: ...".'],
                ...$validator->errors()->toArray(),
            ]);
        }

        return [
            'trigger_type' => $triggerType,
            'trigger_expression' => $triggerExpression,
            'action_tool' => $actionTool,
            'action_args' => $actionArgs,
        ];
    }

    private function determineActionTool(string $normalizedPrompt, ?string $explicitTool): string
    {
        if (is_string($explicitTool) && trim($explicitTool) !== '') {
            return strtolower(trim($explicitTool));
        }

        if (str_contains($normalizedPrompt, 'create task')) {
            return 'tasks.create';
        }

        if (str_contains($normalizedPrompt, 'reassign task')) {
            return 'tasks.reassign';
        }

        if (str_contains($normalizedPrompt, 'schedule meeting')) {
            return 'meetings.schedule';
        }

        if (str_contains($normalizedPrompt, 'create project')) {
            return 'projects.create';
        }

        return 'notifications.send';
    }

    /**
     * @param array<string, mixed> $structuredArgs
     * @return array<string, mixed>
     */
    private function mergeActionArgs(string $actionTool, string $prompt, array $structuredArgs): array
    {
        $defaults = $this->defaultActionArgs($actionTool);
        $allowedKeys = array_keys($defaults);

        $normalizedStructured = [];
        foreach ($structuredArgs as $key => $value) {
            $normalizedKey = strtolower((string) $key);
            if (! in_array($normalizedKey, $allowedKeys, true)) {
                continue;
            }

            if ($normalizedKey === 'roles' && is_string($value)) {
                $normalizedStructured[$normalizedKey] = array_values(array_filter(array_map(
                    static fn(string $role): string => trim($role),
                    preg_split('/[|,]/', $value) ?: [],
                )));
                continue;
            }

            $normalizedStructured[$normalizedKey] = $value;
        }

        if ($actionTool === 'notifications.send' && ! isset($normalizedStructured['message'])) {
            $normalizedStructured['message'] = trim($prompt) !== ''
                ? trim($prompt)
                : $defaults['message'];
        }

        return array_replace($defaults, $normalizedStructured);
    }

    /**
     * @return array<string, mixed>
     */
    private function defaultActionArgs(string $actionTool): array
    {
        return match ($actionTool) {
            'tasks.create' => [
                'title' => 'Automated task',
                'type' => 'inspection',
                'description' => 'Task generated from automation rule.',
                'location' => 'Operations Center',
                'address' => 'Automation Address Placeholder',
                'due_date' => now()->addDay()->toIso8601String(),
            ],
            'tasks.reassign' => [
                'task_id' => 0,
                'assignee_id' => 0,
            ],
            'meetings.schedule' => [
                'title' => 'Automation Meeting',
                'description' => 'Meeting generated by automation rule.',
                'timezone' => 'Africa/Lagos',
                'start_at' => now()->addDay()->setHour(10)->setMinute(0)->toIso8601String(),
                'end_at' => now()->addDay()->setHour(11)->setMinute(0)->toIso8601String(),
            ],
            'projects.create' => [
                'name' => 'Automation Project',
                'description' => 'Project generated by automation rule.',
                'status' => 'planning',
                'start_date' => now()->toDateString(),
            ],
            default => [
                'title' => 'Automation alert',
                'message' => 'Automated notification triggered by copilot rule.',
                'roles' => ['admin', 'supervisor'],
            ],
        };
    }

    /**
     * @return array<string, array<int, string>>
     */
    private function actionValidationRules(string $actionTool): array
    {
        return match ($actionTool) {
            'tasks.create' => [
                'action_args.title' => ['required', 'string', 'max:120'],
                'action_args.type' => ['required', 'string', 'max:50'],
                'action_args.description' => ['required', 'string', 'max:500'],
                'action_args.location' => ['required', 'string', 'max:120'],
                'action_args.address' => ['required', 'string', 'max:190'],
                'action_args.due_date' => ['required', 'date'],
            ],
            'tasks.reassign' => [
                'action_args.task_id' => ['required', 'integer', 'min:1'],
                'action_args.assignee_id' => ['required', 'integer', 'min:1'],
            ],
            'meetings.schedule' => [
                'action_args.title' => ['required', 'string', 'max:150'],
                'action_args.description' => ['nullable', 'string', 'max:500'],
                'action_args.timezone' => ['required', 'string', 'max:60'],
                'action_args.start_at' => ['required', 'date'],
                'action_args.end_at' => ['required', 'date', 'after:action_args.start_at'],
            ],
            'projects.create' => [
                'action_args.name' => ['required', 'string', 'max:120'],
                'action_args.description' => ['nullable', 'string', 'max:500'],
                'action_args.status' => ['required', 'string', 'in:planning,active,completed,on_hold'],
                'action_args.start_date' => ['required', 'date'],
            ],
            default => [
                'action_args.title' => ['required', 'string', 'max:120'],
                'action_args.message' => ['required', 'string', 'max:500'],
                'action_args.roles' => ['required', 'array', 'min:1'],
                'action_args.roles.*' => ['required', 'string', 'in:admin,supervisor,manager,agent'],
            ],
        };
    }

    /**
     * @return array{tool?: string, args: array<string, mixed>}
     */
    private function extractStructuredFields(string $prompt): array
    {
        $structured = [
            'args' => [],
        ];

        if (preg_match('/\{[\s\S]*\}/', $prompt, $matches) === 1) {
            $decoded = json_decode($matches[0], true);
            if (is_array($decoded)) {
                if (isset($decoded['tool']) && is_string($decoded['tool'])) {
                    $structured['tool'] = trim($decoded['tool']);
                }

                if (isset($decoded['args']) && is_array($decoded['args'])) {
                    $structured['args'] = $decoded['args'];
                }
            }
        }

        if (preg_match_all('/([a-z_]+)\s*[:=]\s*("[^"]*"|\'[^\']*\'|[^,;\n]+)/i', $prompt, $pairs, PREG_SET_ORDER) > 0) {
            foreach ($pairs as $pair) {
                $key = strtolower(trim((string) ($pair[1] ?? '')));
                $value = trim((string) ($pair[2] ?? ''));
                $value = trim($value, " \t\n\r\0\x0B\"'");

                if ($key === 'tool') {
                    $structured['tool'] = $value;
                    continue;
                }

                $structured['args'][$key] = is_numeric($value) ? (int) $value : $value;
            }
        }

        return $structured;
    }
}
