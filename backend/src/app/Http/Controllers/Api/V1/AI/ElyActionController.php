<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\AI;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Services\AI\Agent\ElyAgent;
use App\Services\AI\Agent\Tools\ToolContext;
use App\Services\Company\CompanyContextService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Confirm or cancel an action ELY prepared (agent engine). The pending action
 * must belong to the requesting user and their active company.
 */
class ElyActionController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(
        private readonly ElyAgent $agent,
        private readonly CompanyContextService $companyContextService,
    ) {}

    public function confirm(Request $request, string $pending): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable'],
            'action_args' => ['sometimes', 'array'],
            'client_timezone' => ['nullable', 'string', 'max:64', 'timezone'],
        ]);

        $context = $this->context($request, $validated);
        $result = $this->agent->confirmById(
            $context,
            $pending,
            is_array($validated['action_args'] ?? null) ? $validated['action_args'] : [],
        );

        return $this->success(message: 'ELY action processed.', data: $result);
    }

    public function undo(Request $request, int $audit): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable'],
        ]);

        $result = $this->agent->undoAudit($this->context($request, $validated), $audit);

        return $this->success(message: 'ELY undo processed.', data: $result);
    }

    public function cancel(Request $request, string $pending): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable'],
        ]);

        $result = $this->agent->cancelById($this->context($request, $validated), $pending);

        return $this->success(message: 'ELY action cancelled.', data: $result);
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function context(Request $request, array $validated): ToolContext
    {
        $user = $request->user();
        $resolved = $this->companyContextService->resolve(
            $user,
            $this->resolveCompanyContextId($validated['company_id'] ?? null),
        );

        return new ToolContext(
            user: $user,
            companyId: (int) $resolved['company']->id,
            role: (string) $resolved['role'],
            timezone: isset($validated['client_timezone']) ? (string) $validated['client_timezone'] : null,
        );
    }
}
