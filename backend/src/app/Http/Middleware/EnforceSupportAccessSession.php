<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\SupportAccessSession;
use App\Models\User;
use App\Services\Admin\AdminActionLogger;
use App\Services\Admin\SupportAccessService;
use Closure;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

class EnforceSupportAccessSession
{
    public function __construct(
        private readonly AdminActionLogger $actionLogger,
        private readonly SupportAccessService $supportAccessService,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->user()?->currentAccessToken();

        if (! $token instanceof PersonalAccessToken) {
            return $next($request);
        }

        $session = SupportAccessSession::query()
            ->where('personal_access_token_id', $token->id)
            ->first();

        $isSupportToken = str_starts_with((string) $token->name, 'support-access:');

        if (! $session) {
            if ($isSupportToken) {
                $token->delete();
                throw new AuthorizationException('This support session is no longer valid.');
            }

            return $next($request);
        }

        if (! $session->isActive()) {
            if ($session->session_expires_at?->isPast()
                && $session->ended_at === null
                && $session->revoked_at === null) {
                $this->supportAccessService->expire($session, $request);
            } else {
                $token->delete();
            }
            throw new AuthorizationException('This support session has ended or expired.');
        }

        $user = $request->user();
        $hasLiveMembership = $user instanceof User
            && (int) $user->id === (int) $session->target_user_id
            && $user->canAuthenticate()
            && DB::table('company_users')
                ->join('companies', 'companies.id', '=', 'company_users.company_id')
                ->where('company_users.user_id', $user->id)
                ->where('company_users.company_id', $session->company_id)
                ->where('companies.status', 'active')
                ->exists();

        if (! $hasLiveMembership) {
            $this->supportAccessService->revoke(
                $session,
                $request,
                'Target account or pinned company membership is no longer eligible.',
            );
            throw new AuthorizationException('This support session is no longer valid.');
        }

        $companyId = (int) $session->company_id;
        $request->attributes->set('support_access_session', $session);
        $request->attributes->set('support_company_id', $companyId);
        $request->attributes->set('support_effective_role', 'owner');
        $request->query->set('company_id', $companyId);
        $request->request->set('company_id', $companyId);

        if ($this->isAlwaysAllowed($request)) {
            return $next($request);
        }

        if ($session->access_level === SupportAccessSession::ACCESS_READ_ONLY
            && ! $request->isMethodSafe()) {
            $this->logDenied($session, $request, 'read_only');
            throw new AuthorizationException('This support session is read-only.');
        }

        if ($session->access_level === SupportAccessSession::ACCESS_OPERATIONAL_FULL
            && ! $request->isMethodSafe()
            && $this->isProtectedMutation($request)) {
            $this->logDenied($session, $request, 'protected_operation');
            throw new AuthorizationException(
                'This security-sensitive action is blocked during support access.'
            );
        }

        return $next($request);
    }

    private function isAlwaysAllowed(Request $request): bool
    {
        return in_array($request->route()?->getName(), [
            'support-access.status',
            'support-access.end',
        ], true);
    }

    private function isProtectedMutation(Request $request): bool
    {
        $path = trim($request->path(), '/');
        $protectedPrefixes = [
            'api/v1/auth/',
            'api/v1/billing/',
            'api/v1/map-credits/topup',
            'api/v1/company/settings',
            'api/v1/user/profile',
            'api/v1/admin/internal-users',
            'api/v1/internal-users',
            'api/v1/drive',
            'api/v1/calendar',
            'api/v1/google',
            'api/v1/gmail',
            'api/v1/integrations',
        ];

        foreach ($protectedPrefixes as $prefix) {
            if (str_starts_with($path, $prefix)) {
                return true;
            }
        }

        return false;
    }

    private function logDenied(
        SupportAccessSession $session,
        Request $request,
        string $reason,
    ): void {
        $this->actionLogger->log(
            action: 'support_access.action_denied',
            targetType: 'route',
            targetId: (string) ($request->route()?->getName() ?? $request->path()),
            context: [
                'support_session_id' => $session->id,
                'target_user_id' => $session->target_user_id,
                'company_id' => $session->company_id,
                'access_level' => $session->access_level,
                'reason' => $reason,
                'method' => $request->method(),
            ],
            request: $request,
            adminId: $session->admin_id !== null ? (int) $session->admin_id : null,
        );
    }
}
