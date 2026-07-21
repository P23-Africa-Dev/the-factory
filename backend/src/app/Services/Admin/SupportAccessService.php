<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Enums\NotificationCategory;
use App\Enums\NotificationDeliveryType;
use App\Enums\NotificationPriority;
use App\Models\Admin;
use App\Models\Company;
use App\Models\SupportAccessSession;
use App\Models\User;
use App\Services\Notification\NotificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class SupportAccessService
{
    public function __construct(
        private readonly AdminActionLogger $actionLogger,
        private readonly NotificationService $notificationService,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     * @return array{session: SupportAccessSession, exchange_code: string}
     */
    public function create(Admin $admin, User $target, array $data, Request $request): array
    {
        if (! $admin->canAccessAbility('impersonate_users')) {
            abort(403, 'Only super administrators can create support sessions.');
        }

        if (! Hash::check((string) $data['admin_password'], (string) $admin->password)) {
            $this->actionLogger->log(
                action: 'support_access.step_up_failed',
                targetType: User::class,
                targetId: (string) $target->id,
                context: ['company_id' => (int) $data['company_id']],
                request: $request,
                adminId: (int) $admin->id,
            );

            throw ValidationException::withMessages([
                'admin_password' => ['The administrator password is incorrect.'],
            ]);
        }

        $company = $this->eligibleCompany($target, (int) $data['company_id']);
        $this->ensureEligibleTarget($target);

        $exchangeCode = Str::random(64);

        $session = SupportAccessSession::query()->create([
            'admin_id' => $admin->id,
            'target_user_id' => $target->id,
            'company_id' => $company->id,
            'access_level' => (string) $data['access_level'],
            'reason' => trim((string) $data['reason']),
            'ticket_reference' => filled($data['ticket_reference'] ?? null)
                ? trim((string) $data['ticket_reference'])
                : null,
            'exchange_code_hash' => hash('sha256', $exchangeCode),
            'exchange_code_expires_at' => now()->addSeconds(60),
            'admin_name_snapshot' => $admin->name,
            'admin_email_snapshot' => $admin->email,
            'target_name_snapshot' => $target->name,
            'target_email_snapshot' => $target->email,
            'company_name_snapshot' => $company->name,
            'target_company_role_snapshot' => (string) $company->pivot?->role,
            'request_ip' => $request->ip(),
            'request_user_agent' => substr((string) $request->userAgent(), 0, 255) ?: null,
        ]);

        $this->actionLogger->log(
            action: 'support_access.created',
            targetType: User::class,
            targetId: (string) $target->id,
            context: $this->auditContext($session),
            request: $request,
            adminId: (int) $admin->id,
        );

        return [
            'session' => $session,
            'exchange_code' => $exchangeCode,
        ];
    }

    /**
     * @return array{session: SupportAccessSession, token: string, user: User}
     */
    public function exchange(string $code, Request $request): array
    {
        $codeHash = hash('sha256', $code);

        $result = DB::transaction(function () use ($codeHash): array {
            $session = SupportAccessSession::query()
                ->where('exchange_code_hash', $codeHash)
                ->lockForUpdate()
                ->first();

            if (! $session
                || $session->exchanged_at !== null
                || $session->ended_at !== null
                || $session->revoked_at !== null
                || ! $session->exchange_code_expires_at?->isFuture()) {
                throw ValidationException::withMessages([
                    'code' => ['This support access link is invalid, expired, or already used.'],
                ]);
            }

            $target = User::query()->find($session->target_user_id);
            if (! $target) {
                throw ValidationException::withMessages([
                    'code' => ['The target account is no longer available.'],
                ]);
            }

            $company = $this->eligibleCompany($target, (int) $session->company_id);
            $this->ensureEligibleTarget($target);

            $abilities = $session->access_level === SupportAccessSession::ACCESS_OPERATIONAL_FULL
                ? ['support:read', 'support:operate']
                : ['support:read'];

            $expiresAt = now()->addMinutes(15);
            $newToken = $target->createToken(
                name: 'support-access:' . $session->id,
                abilities: $abilities,
                expiresAt: $expiresAt,
            );

            $session->forceFill([
                'personal_access_token_id' => $newToken->accessToken->id,
                'exchange_code_hash' => null,
                'exchange_code_expires_at' => null,
                'exchanged_at' => now(),
                'session_expires_at' => $expiresAt,
            ])->save();

            return [
                'session' => $session->fresh(),
                'token' => $newToken->plainTextToken,
                'user' => $target,
                'company' => $company,
            ];
        });

        /** @var SupportAccessSession $session */
        $session = $result['session'];
        $this->actionLogger->log(
            action: 'support_access.started',
            targetType: User::class,
            targetId: (string) $session->target_user_id,
            context: $this->auditContext($session),
            request: $request,
            adminId: (int) $session->admin_id,
        );
        $this->notifyTarget($session, started: true);

        return [
            'session' => $session,
            'token' => $result['token'],
            'user' => $result['user'],
        ];
    }

    public function end(SupportAccessSession $session, Request $request): void
    {
        if ($session->ended_at !== null) {
            return;
        }

        DB::transaction(function () use ($session): void {
            if ($session->personal_access_token_id !== null) {
                DB::table('personal_access_tokens')
                    ->where('id', $session->personal_access_token_id)
                    ->delete();
            }

            $session->forceFill(['ended_at' => now()])->save();
        });

        $this->actionLogger->log(
            action: 'support_access.ended',
            targetType: User::class,
            targetId: (string) $session->target_user_id,
            context: $this->auditContext($session),
            request: $request,
            adminId: (int) $session->admin_id,
        );
        $this->notifyTarget($session, started: false);
    }

    public function expire(SupportAccessSession $session, Request $request): void
    {
        if ($session->revoked_at !== null || $session->ended_at !== null) {
            return;
        }

        DB::transaction(function () use ($session): void {
            if ($session->personal_access_token_id !== null) {
                DB::table('personal_access_tokens')
                    ->where('id', $session->personal_access_token_id)
                    ->delete();
            }

            $session->forceFill(['revoked_at' => now()])->save();
        });

        $this->actionLogger->log(
            action: 'support_access.expired',
            targetType: User::class,
            targetId: (string) $session->target_user_id,
            context: $this->auditContext($session),
            request: $request,
            adminId: (int) $session->admin_id,
        );
        $this->notifyTarget($session, started: false);
    }

    /**
     * @return array<string, mixed>
     */
    public function payload(SupportAccessSession $session): array
    {
        return [
            'id' => $session->id,
            'access_level' => $session->access_level,
            'reason' => $session->reason,
            'ticket_reference' => $session->ticket_reference,
            'expires_at' => $session->session_expires_at?->toIso8601String(),
            'admin' => [
                'name' => $session->admin_name_snapshot,
                'email' => $session->admin_email_snapshot,
            ],
            'target_user' => [
                'id' => $session->target_user_id,
                'name' => $session->target_name_snapshot,
                'email' => $session->target_email_snapshot,
            ],
            'company' => [
                'id' => $session->company_id,
                'name' => $session->company_name_snapshot,
                'role' => $session->target_company_role_snapshot,
            ],
            'dashboard_path' => $session->target_company_role_snapshot === 'agent'
                ? '/agent/dashboard'
                : '/dashboard',
        ];
    }

    private function ensureEligibleTarget(User $target): void
    {
        $onboarded = $target->hasCompletedOnboarding()
            || $target->hasCompletedEnterpriseOnboarding()
            || $target->hasCompletedInternalOnboarding();

        if (! $target->canAuthenticate() || ! $onboarded) {
            throw ValidationException::withMessages([
                'user' => ['Support access is only available for active, onboarded accounts.'],
            ]);
        }
    }

    private function eligibleCompany(User $target, int $companyId): Company
    {
        $company = $target->companies()
            ->where('companies.id', $companyId)
            ->where('companies.status', 'active')
            ->first();

        if (! $company) {
            throw ValidationException::withMessages([
                'company_id' => ['The target user is not an active member of that company.'],
            ]);
        }

        return $company;
    }

    /**
     * @return array<string, mixed>
     */
    private function auditContext(SupportAccessSession $session): array
    {
        return [
            'support_session_id' => $session->id,
            'company_id' => $session->company_id,
            'company_name' => $session->company_name_snapshot,
            'access_level' => $session->access_level,
            'reason' => $session->reason,
            'ticket_reference' => $session->ticket_reference,
            'expires_at' => $session->session_expires_at?->toIso8601String(),
        ];
    }

    private function notifyTarget(SupportAccessSession $session, bool $started): void
    {
        if ($session->target_user_id === null || $session->company_id === null) {
            return;
        }

        $action = $started ? 'started' : 'ended';
        $message = $started
            ? "{$session->admin_name_snapshot} started a {$session->access_level} support session for your account."
            : "{$session->admin_name_snapshot} ended the support session for your account.";

        $this->notificationService->notifyUser((int) $session->target_user_id, [
            'company_id' => (int) $session->company_id,
            'type' => 'auth.support_access_' . $action,
            'category' => NotificationCategory::AUTH->value,
            'title' => 'Support access ' . $action,
            'message' => $message,
            'reference_type' => SupportAccessSession::class,
            'reference_id' => (int) $session->id,
            'priority' => NotificationPriority::HIGH->value,
            'delivery_types' => [
                NotificationDeliveryType::IN_APP->value,
                NotificationDeliveryType::EMAIL->value,
                NotificationDeliveryType::PUSH->value,
            ],
            'metadata' => [
                'support_session_id' => $session->id,
                'access_level' => $session->access_level,
                'reason' => $session->reason,
                'ticket_reference' => $session->ticket_reference,
            ],
            'dedupe_key' => 'support-access-' . $action . ':' . $session->id,
        ]);
    }
}
