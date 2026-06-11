<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\AI;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Models\AiAutomationRule;
use App\Services\AI\Automation\AutomationRuleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CopilotAutomationController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(private readonly AutomationRuleService $automationRuleService) {}

    public function preview(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable'],
            'prompt' => ['required', 'string', 'min:5', 'max:5000'],
        ]);

        $preview = $this->automationRuleService->preview(
            user: $request->user(),
            prompt: (string) $validated['prompt'],
            companyId: $this->resolveCompanyContextId($validated['company_id'] ?? null),
        );

        return $this->success(
            message: 'Automation rule preview generated successfully.',
            data: $preview,
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable'],
            'name' => ['nullable', 'string', 'max:255'],
            'prompt' => ['required', 'string', 'min:5', 'max:5000'],
            'run_now' => ['sometimes', 'boolean'],
        ]);

        $rule = $this->automationRuleService->create(
            user: $request->user(),
            prompt: (string) $validated['prompt'],
            name: isset($validated['name']) ? (string) $validated['name'] : null,
            companyId: $this->resolveCompanyContextId($validated['company_id'] ?? null),
        );

        if ((bool) ($validated['run_now'] ?? false)) {
            $this->automationRuleService->runNow(
                user: $request->user(),
                rule: $rule,
                companyId: $this->resolveCompanyContextId($validated['company_id'] ?? null),
            );
        }

        return $this->success(
            message: 'Automation rule created successfully.',
            data: [
                'automation' => $rule,
            ],
            status: 201,
        );
    }

    public function index(Request $request): JsonResponse
    {
        $items = $this->automationRuleService->list(
            user: $request->user(),
            companyId: $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Automation rules fetched successfully.',
            data: [
                'items' => $items,
            ],
        );
    }

    public function run(Request $request, AiAutomationRule $automation): JsonResponse
    {
        $rule = $this->automationRuleService->runNow(
            user: $request->user(),
            rule: $automation,
            companyId: $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Automation run queued successfully.',
            data: [
                'automation' => $rule,
                'queued' => true,
            ],
            status: 202,
        );
    }
}
