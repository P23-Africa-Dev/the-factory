<?php

declare(strict_types=1);

namespace App\Services\Security;

use App\Models\Admin;
use App\Models\SecurityAuditEvent;
use App\Models\User;
use Illuminate\Http\Request;

class SecurityAuditLogger
{
    public const LOGIN_SUCCEEDED = 'auth.login.succeeded';

    public const LOGIN_FAILED = 'auth.login.failed';

    public const LOGOUT = 'auth.logout';

    public const PASSWORD_RESET_REQUESTED = 'auth.password_reset.requested';

    public const PASSWORD_RESET_COMPLETED = 'auth.password_reset.completed';

    public const EXPORT_LEADS = 'data.export.leads';

    public const EXPORT_PAYROLL = 'data.export.payroll';

    public const SUCCESS = 'success';

    public const FAILURE = 'failure';

    public const CHANNEL_ADMIN_WEB = 'admin_web';

    public const CHANNEL_ADMIN_API = 'admin_api';

    public const CHANNEL_AGENT_API = 'agent_api';

    public const CHANNEL_INTERNAL_API = 'internal_api';

    public const CHANNEL_API = 'api';

    public function log(
        string $action,
        string $result,
        ?string $channel = null,
        ?int $userId = null,
        ?int $adminId = null,
        ?int $companyId = null,
        ?string $email = null,
        array $context = [],
        ?Request $request = null,
    ): SecurityAuditEvent {
        $request ??= request();

        return SecurityAuditEvent::query()->create([
            'action' => $action,
            'result' => $result,
            'channel' => $channel,
            'user_id' => $userId,
            'admin_id' => $adminId,
            'company_id' => $companyId,
            'email' => $email !== null ? strtolower(trim($email)) : null,
            'ip_address' => $request?->ip(),
            'user_agent' => $this->userAgent($request),
            'context' => $context === [] ? null : $context,
            'created_at' => now(),
        ]);
    }

    public function loginFailed(string $channel, ?User $user, string $email, string $reason): void
    {
        $this->log(
            action: self::LOGIN_FAILED,
            result: self::FAILURE,
            channel: $channel,
            userId: $user?->id,
            companyId: $user ? $this->primaryCompanyId($user) : null,
            email: $email,
            context: ['reason' => $reason],
        );
    }

    /**
     * @param  array<string, mixed>  $context
     */
    public function loginSucceeded(string $channel, User $user, array $context = []): void
    {
        $this->log(
            action: self::LOGIN_SUCCEEDED,
            result: self::SUCCESS,
            channel: $channel,
            userId: (int) $user->id,
            companyId: $this->primaryCompanyId($user),
            email: $user->email,
            context: $context,
        );
    }

    /**
     * @param  array<string, mixed>  $context
     */
    public function adminWebLogin(string $result, ?Admin $admin, string $email, array $context = []): void
    {
        $this->log(
            action: $result === self::SUCCESS ? self::LOGIN_SUCCEEDED : self::LOGIN_FAILED,
            result: $result,
            channel: self::CHANNEL_ADMIN_WEB,
            adminId: $admin?->id,
            email: $email,
            context: $context,
        );
    }

    public function logout(?User $user, string $channel): void
    {
        $this->log(
            action: self::LOGOUT,
            result: self::SUCCESS,
            channel: $channel,
            userId: $user?->id,
            companyId: $user ? $this->primaryCompanyId($user) : null,
            email: $user?->email,
        );
    }

    /**
     * @param  array<string, mixed>  $context
     */
    public function passwordReset(string $action, string $result, ?User $user, string $email, array $context = []): void
    {
        $this->log(
            action: $action,
            result: $result,
            channel: self::CHANNEL_API,
            userId: $user?->id,
            companyId: $user ? $this->primaryCompanyId($user) : null,
            email: $email,
            context: $context,
        );
    }

    /**
     * @param  array<string, mixed>  $context
     */
    public function dataExport(string $action, User $user, int $companyId, array $context = []): void
    {
        $this->log(
            action: $action,
            result: self::SUCCESS,
            channel: self::CHANNEL_API,
            userId: (int) $user->id,
            companyId: $companyId,
            email: $user->email,
            context: $context,
        );
    }

    public function primaryCompanyId(?User $user): ?int
    {
        if ($user === null) {
            return null;
        }

        $id = $user->companies()->orderBy('company_users.joined_at')->value('companies.id');

        return $id !== null ? (int) $id : null;
    }

    private function userAgent(?Request $request): ?string
    {
        $agent = substr((string) $request?->userAgent(), 0, 255);

        return $agent !== '' ? $agent : null;
    }
}
