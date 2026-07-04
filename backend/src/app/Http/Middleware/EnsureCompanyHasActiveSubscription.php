<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Enums\SubscriptionStatus;
use App\Models\User;
use App\Services\Billing\BillingEnforcementSettingService;
use App\Services\Company\CompanyContextService;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureCompanyHasActiveSubscription
{
    public function __construct(
        private readonly CompanyContextService $companyContext,
        private readonly BillingEnforcementSettingService $billingEnforcement,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        if (! $this->billingEnforcement->isEnabled()) {
            return $next($request);
        }

        if (app()->environment('testing') && ! config('billing.enforce_in_tests')) {
            return $next($request);
        }

        $user = $request->user();

        if (! $user instanceof User) {
            return $next($request);
        }

        if ($user->internal_role !== null) {
            return $next($request);
        }

        if ($this->isExempt($request)) {
            return $next($request);
        }

        try {
            ['company' => $company] = $this->companyContext->resolve($user, $this->companyIdFromRequest($request));
        } catch (\Throwable) {
            return $next($request);
        }

        $status = $company->subscriptionStatusEnum();

        if ($status === SubscriptionStatus::ACTIVE) {
            return $next($request);
        }

        $code = match ($status) {
            SubscriptionStatus::SUSPENDED => 'subscription_suspended',
            SubscriptionStatus::GRACE => 'subscription_grace_expired',
            SubscriptionStatus::PAST_DUE => 'subscription_past_due',
            default => 'subscription_required',
        };

        $message = match ($status) {
            SubscriptionStatus::SUSPENDED => 'Your subscription has expired. Please renew to restore access to your dashboard.',
            SubscriptionStatus::GRACE => 'Your subscription requires renewal to keep dashboard access.',
            SubscriptionStatus::PAST_DUE => 'Your last payment failed. Please update your billing to restore dashboard access.',
            default => 'A subscription is required before you can access the dashboard.',
        };

        return self::blockedResponse(
            message: $message,
            code: $code,
            companyName: $company->name,
            subscriptionStatus: $status->value,
            assignedPlanKey: $company->assigned_plan_key,
            graceEndsAt: $company->subscription_grace_ends_at,
            canChoosePlan: $company->canChoosePlan(),
        );
    }

    private function isExempt(Request $request): bool
    {
        if ($request->is('api/v1/billing*')) {
            return true;
        }

        if ($request->is('api/v1/user/me')) {
            return true;
        }

        if ($request->is('api/v1/auth/logout')) {
            return true;
        }

        if ($request->is('api/v1/onboarding/workspace')) {
            return true;
        }

        return false;
    }

    private function companyIdFromRequest(Request $request): ?int
    {
        $companyId = $request->header('X-Company-Id') ?? $request->input('company_id');

        return $companyId !== null ? (int) $companyId : null;
    }

    public static function blockedResponse(
        string $message,
        string $code,
        string $companyName,
        string $subscriptionStatus,
        ?string $assignedPlanKey,
        ?\Carbon\CarbonInterface $graceEndsAt,
        bool $canChoosePlan,
    ): JsonResponse {
        return response()->json([
            'success' => false,
            'message' => $message,
            'data' => [
                'company_name' => $companyName,
                'subscription_status' => $subscriptionStatus,
                'assigned_plan_key' => $assignedPlanKey,
                'grace_ends_at' => $graceEndsAt?->toIso8601String(),
                'can_choose_plan' => $canChoosePlan,
            ],
            'errors' => null,
            'code' => $code,
        ], 402);
    }
}
