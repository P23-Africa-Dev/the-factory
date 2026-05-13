<?php

declare(strict_types=1);

namespace App\Services\Internal;

use App\Models\InternalUserInvitation;
use App\Models\User;
use App\Notifications\InternalUserOnboardingInviteNotification;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

class InternalUserOnboardingService
{
    public function __construct(private readonly InternalUserAccessService $accessService) {}

    public function createByManager(User $creator, array $data): array
    {
        ['company' => $company, 'role' => $actorRole] = $this->accessService->resolveCompanyContext($creator, $data['company_id'] ?? null);
        $this->accessService->ensureCanManageInternalUsers($actorRole);

        $role = (string) $data['role'];
        $supervisorUserId = $data['supervisor_user_id'] ?? null;

        if ($role === 'agent' && ! $supervisorUserId) {
            throw ValidationException::withMessages([
                'supervisor_user_id' => ['Field agents must be assigned to a supervisor.'],
            ]);
        }

        $prefilledProfile = $this->resolveProfileData(
            phoneNumber: $data['phone_number'] ?? null,
            gender: $data['gender'] ?? null,
            avatarKey: $data['avatar_key'] ?? null,
            assignRandomAvatar: true,
            requireCompleteProfile: false,
        );

        return DB::transaction(function () use ($creator, $company, $data, $role, $supervisorUserId, $prefilledProfile): array {
            $workDays = collect($data['work_days'])->map(fn ($d) => strtolower((string) $d))->unique()->values()->all();

            $user = User::query()->create([
                'name' => $data['full_name'],
                'email' => strtolower($data['email']),
                'password' => Str::random(40),
                'is_active' => false,
                'onboarding_status' => 'pending_onboarding',
                'internal_role' => $role,
                'assigned_zone' => $data['assigned_zone'],
                'work_days' => $workDays,
                'base_salary' => $data['base_salary'],
                'salary_currency' => strtoupper((string) ($data['currency_code'] ?? $company->currency_code ?? config('internal_onboarding.default_currency', 'USD'))),
                'commission_enabled' => (bool) ($data['commission_enabled'] ?? false),
                'supervisor_user_id' => $supervisorUserId,
                'invited_by_user_id' => $creator->id,
                'phone_number' => $prefilledProfile['phone_number'],
                'gender' => $prefilledProfile['gender'],
                'avatar' => $prefilledProfile['avatar_key'],
            ]);

            $pivotRole = $role === 'supervisor' ? 'supervisor' : 'agent';

            $company->users()->syncWithoutDetaching([
                $user->id => [
                    'role' => $pivotRole,
                    'joined_at' => now(),
                ],
            ]);

            if ($role === 'agent') {
                $this->ensureValidSupervisor($company->id, (int) $supervisorUserId);
            }

            if ($role === 'supervisor' && ! empty($data['assign_agent_ids'])) {
                $this->assignAgentsToSupervisor($company->id, (int) $user->id, Arr::wrap($data['assign_agent_ids']));
            }

            ['invitation' => $invitation, 'plain_token' => $plainToken] = $this->createInvitation(
                companyId: (int) $company->id,
                userId: (int) $user->id,
                invitedByUserId: (int) $creator->id,
                role: $role,
                supervisorUserId: $supervisorUserId ? (int) $supervisorUserId : null,
            );

            $link = $this->buildInviteLink((int) $invitation->id, $plainToken);

            try {
                $user->notify(new InternalUserOnboardingInviteNotification(
                    invitationLink: $link,
                    role: ucfirst($role),
                    zone: (string) $user->assigned_zone,
                ));
            } catch (Throwable $e) {
                Log::error('Internal onboarding invite delivery failed.', [
                    'email' => $user->email,
                    'user_id' => $user->id,
                    'company_id' => $company->id,
                    'role' => $role,
                    'exception' => $e::class,
                    'message' => $e->getMessage(),
                ]);

                throw ValidationException::withMessages([
                    'email' => ['Unable to deliver onboarding invitation right now. Please try again shortly.'],
                ]);
            }

            $invitation->update(['sent_at' => now()]);

            return [
                'user' => $user->fresh(),
                'invitation' => $invitation->fresh(),
                'invite_expires_at' => $invitation->expires_at,
            ];
        });
    }

    public function resendInvite(User $actor, User $user, ?int $companyId = null): array
    {
        ['company' => $company, 'role' => $actorRole] = $this->accessService->resolveCompanyContext($actor, $companyId);
        $this->accessService->ensureCanManageInternalUsers($actorRole);

        if (! $user->internal_role || $user->onboarding_status === 'active') {
            throw ValidationException::withMessages([
                'user' => ['This user is not eligible for onboarding invitation resend.'],
            ]);
        }

        $member = DB::table('company_users')
            ->where('company_id', $company->id)
            ->where('user_id', $user->id)
            ->exists();

        if (! $member) {
            throw ValidationException::withMessages([
                'user' => ['User is not attached to this company context.'],
            ]);
        }

        return DB::transaction(function () use ($actor, $company, $user): array {
            InternalUserInvitation::query()
                ->where('company_id', $company->id)
                ->where('user_id', $user->id)
                ->whereNull('accepted_at')
                ->whereNull('revoked_at')
                ->update(['revoked_at' => now()]);

            ['invitation' => $invitation, 'plain_token' => $plainToken] = $this->createInvitation(
                companyId: (int) $company->id,
                userId: (int) $user->id,
                invitedByUserId: (int) $actor->id,
                role: (string) $user->internal_role,
                supervisorUserId: $user->supervisor_user_id,
            );

            $link = $this->buildInviteLink((int) $invitation->id, $plainToken);

            try {
                $user->notify(new InternalUserOnboardingInviteNotification(
                    invitationLink: $link,
                    role: ucfirst((string) $user->internal_role),
                    zone: (string) $user->assigned_zone,
                ));
            } catch (Throwable $e) {
                Log::error('Internal onboarding invite resend failed.', [
                    'email' => $user->email,
                    'user_id' => $user->id,
                    'company_id' => $company->id,
                    'actor_id' => $actor->id,
                    'role' => $user->internal_role,
                    'exception' => $e::class,
                    'message' => $e->getMessage(),
                ]);

                throw ValidationException::withMessages([
                    'email' => ['Unable to deliver onboarding invitation right now. Please try again shortly.'],
                ]);
            }

            $invitation->update(['sent_at' => now()]);

            return [
                'invitation' => $invitation->fresh(),
                'invite_expires_at' => $invitation->expires_at,
            ];
        });
    }

    public function assignSupervisor(User $actor, User $agent, int $supervisorUserId, ?int $companyId = null): User
    {
        ['company' => $company, 'role' => $actorRole] = $this->accessService->resolveCompanyContext($actor, $companyId);
        $this->accessService->ensureCanManageInternalUsers($actorRole);

        if ($agent->internal_role !== 'agent') {
            throw ValidationException::withMessages([
                'user' => ['Target user must have agent role.'],
            ]);
        }

        $this->ensureUserInCompanyWithRole((int) $company->id, (int) $agent->id, ['agent']);
        $this->ensureValidSupervisor((int) $company->id, $supervisorUserId);

        $agent->update(['supervisor_user_id' => $supervisorUserId]);

        return $agent->fresh();
    }

    public function previewOnboarding(int $invitationId, string $token): array
    {
        $invitation = InternalUserInvitation::query()->with('user')->findOrFail($invitationId);
        $this->validateInvitationToken($invitation, $token);

        $prefilledProfile = $this->resolveProfileData(
            phoneNumber: $invitation->user->phone_number,
            gender: $invitation->user->gender,
            avatarKey: $invitation->user->avatar,
            assignRandomAvatar: true,
            requireCompleteProfile: false,
        );

        $avatars = $this->avatarCatalog();
        $selectedGender = $prefilledProfile['gender'];
        $options = $selectedGender ? array_values($avatars[$selectedGender] ?? []) : [];

        return [
            'user' => $invitation->user,
            'invitation' => $invitation,
            'avatar_options' => $options,
            'avatar_options_by_gender' => array_map(static fn (array $items): array => array_values($items), $avatars),
            'prefilled_data' => [
                'phone_number' => $prefilledProfile['phone_number'],
                'gender' => $prefilledProfile['gender'],
                'avatar_key' => $prefilledProfile['avatar_key'],
            ],
            'selected_gender' => $selectedGender,
            'selected_avatar_key' => $prefilledProfile['avatar_key'],
            'selected_avatar_svg' => $prefilledProfile['avatar_svg'],
            'suggested_avatar_key' => $prefilledProfile['avatar_key'],
        ];
    }

    public function completeOnboarding(int $invitationId, string $token, array $data): array
    {
        $invitation = InternalUserInvitation::query()->with('user')->findOrFail($invitationId);
        $this->validateInvitationToken($invitation, $token);

        $user = $invitation->user;
        $resolvedProfile = $this->resolveProfileData(
            phoneNumber: $data['phone_number'] ?? $user->phone_number,
            gender: $data['gender'] ?? $user->gender,
            avatarKey: $data['avatar_key'] ?? $user->avatar,
            assignRandomAvatar: true,
            requireCompleteProfile: true,
        );

        return DB::transaction(function () use ($invitation, $user, $data, $resolvedProfile): array {
            $pivotRole = $invitation->role === 'supervisor' ? 'supervisor' : 'agent';

            $invitation->company->users()->syncWithoutDetaching([
                $user->id => [
                    'role' => $pivotRole,
                    'joined_at' => now(),
                ],
            ]);

            $user->update([
                'phone_number' => $resolvedProfile['phone_number'],
                'gender' => $resolvedProfile['gender'],
                'avatar' => $resolvedProfile['avatar_key'],
                'password' => $data['password'],
                'onboarding_status' => 'active',
                'internal_onboarding_completed_at' => now(),
                'is_active' => true,
                'email_verified_at' => $user->email_verified_at ?? now(),
            ]);

            $invitation->update([
                'accepted_at' => now(),
                'token_hash' => hash('sha256', Str::random(64)),
            ]);

            $token = $user->createToken(
                name: 'internal_auth_token',
                abilities: ['*'],
                expiresAt: now()->addDays(30),
            );

            return [
                'user' => $user->fresh(),
                'token' => $token->plainTextToken,
                'avatar_svg' => $resolvedProfile['avatar_svg'],
                'avatar_url' => $resolvedProfile['avatar_url'],
            ];
        });
    }

    private function createInvitation(int $companyId, int $userId, int $invitedByUserId, string $role, ?int $supervisorUserId): array
    {
        $plainToken = Str::random(64);

        $invitation = InternalUserInvitation::query()->create([
            'company_id' => $companyId,
            'user_id' => $userId,
            'invited_by_user_id' => $invitedByUserId,
            'role' => $role,
            'supervisor_user_id' => $supervisorUserId,
            'token_hash' => hash('sha256', $plainToken),
            'expires_at' => now()->addHours((int) config('internal_onboarding.invite_ttl_hours', 72)),
        ]);

        return [
            'invitation' => $invitation,
            'plain_token' => $plainToken,
        ];
    }

    private function validateInvitationToken(InternalUserInvitation $invitation, string $token): void
    {
        if (! $invitation->isUsable()) {
            throw ValidationException::withMessages([
                'invitation' => ['This invitation is no longer valid.'],
            ]);
        }

        if (! hash_equals($invitation->token_hash, hash('sha256', $token))) {
            throw ValidationException::withMessages([
                'token' => ['Invitation token is invalid.'],
            ]);
        }
    }

    private function buildInviteLink(int $invitationId, string $token): string
    {
        $frontendUrl = rtrim((string) config('internal_onboarding.frontend_onboarding_url'), '/');

        $query = http_build_query([
            'invitation_id' => $invitationId,
            'token' => $token,
        ]);

        return $frontendUrl.'?'.$query;
    }

    private function resolveProfileData(
        ?string $phoneNumber,
        ?string $gender,
        ?string $avatarKey,
        bool $assignRandomAvatar,
        bool $requireCompleteProfile,
    ): array {
        $normalizedPhoneNumber = $phoneNumber !== null ? trim($phoneNumber) : null;
        $normalizedGender = $gender !== null ? strtolower(trim($gender)) : null;
        $normalizedAvatarKey = $avatarKey !== null ? trim($avatarKey) : null;

        $avatarCatalog = $this->avatarCatalog();
        $avatarGenderMap = $this->avatarGenderMap();

        if ($normalizedGender !== null && ! array_key_exists($normalizedGender, $avatarCatalog)) {
            throw ValidationException::withMessages([
                'gender' => ['Selected gender is invalid.'],
            ]);
        }

        if ($normalizedAvatarKey !== null) {
            $avatarGender = $avatarGenderMap[$normalizedAvatarKey] ?? null;

            if ($avatarGender === null) {
                throw ValidationException::withMessages([
                    'avatar_key' => ['Selected avatar is invalid.'],
                ]);
            }

            if ($normalizedGender !== null && $normalizedGender !== $avatarGender) {
                throw ValidationException::withMessages([
                    'avatar_key' => ['Selected avatar does not match selected gender.'],
                ]);
            }

            $normalizedGender ??= $avatarGender;
        }

        if ($normalizedAvatarKey === null && $assignRandomAvatar && $normalizedGender !== null) {
            $normalizedAvatarKey = $this->randomAvatarKeyForGender($normalizedGender);
        }

        if ($requireCompleteProfile) {
            $errors = [];

            if ($normalizedPhoneNumber === null || $normalizedPhoneNumber === '') {
                $errors['phone_number'] = ['Phone number is required to complete onboarding.'];
            }

            if ($normalizedGender === null) {
                $errors['gender'] = ['Gender is required to complete onboarding.'];
            }

            if ($normalizedAvatarKey === null) {
                $errors['avatar_key'] = ['Avatar selection is required to complete onboarding.'];
            }

            if ($errors !== []) {
                throw ValidationException::withMessages($errors);
            }
        }

        $avatarOption = $normalizedGender !== null && $normalizedAvatarKey !== null
            ? ($avatarCatalog[$normalizedGender][$normalizedAvatarKey] ?? null)
            : null;

        return [
            'phone_number' => $normalizedPhoneNumber,
            'gender' => $normalizedGender,
            'avatar_key' => $normalizedAvatarKey,
            'avatar_svg' => $avatarOption['svg'] ?? null,
            'avatar_url' => $avatarOption['url'] ?? null,
        ];
    }

    private function avatarCatalog(): array
    {
        $catalog = [
            'male' => [],
            'female' => [],
        ];

        $disk = Storage::disk('public');
        $basePath = trim((string) config('internal_onboarding.avatar_storage_root', 'avatar'), '/');
        $publicBaseUrl = rtrim((string) (
            config('internal_onboarding.avatar_public_base_url')
            ?: config('filesystems.disks.public.url')
            ?: asset('storage')
        ), '/');

        foreach (['male', 'female'] as $gender) {
            $files = $disk->files("{$basePath}/{$gender}");
            sort($files);

            foreach ($files as $file) {
                $filename = basename($file);
                $extension = strtolower((string) pathinfo($filename, PATHINFO_EXTENSION));

                if (! in_array($extension, ['png', 'svg'], true)) {
                    continue;
                }

                $avatarKey = pathinfo($filename, PATHINFO_FILENAME);
                $catalog[$gender][$avatarKey] = [
                    'key' => $avatarKey,
                    'svg' => null,
                    'url' => $publicBaseUrl.'/'.ltrim($file, '/'),
                ];
            }
        }

        $fallbackCatalog = config('internal_onboarding.avatar_catalog', []);

        foreach ($fallbackCatalog as $gender => $avatars) {
            if (! isset($catalog[$gender]) || ! is_array($avatars)) {
                continue;
            }

            foreach ($avatars as $avatarKey => $svg) {
                if (! isset($catalog[$gender][$avatarKey])) {
                    $catalog[$gender][$avatarKey] = [
                        'key' => $avatarKey,
                        'svg' => $svg,
                        'url' => null,
                    ];

                    continue;
                }

                $catalog[$gender][$avatarKey]['svg'] = $svg;
            }
        }

        return $catalog;
    }

    private function avatarGenderMap(): array
    {
        return Collection::make($this->avatarCatalog())
            ->flatMap(fn (array $avatars, string $gender): array => collect(array_keys($avatars))
                ->mapWithKeys(fn (string $avatarKey): array => [$avatarKey => $gender])
                ->all())
            ->all();
    }

    private function randomAvatarKeyForGender(string $gender): ?string
    {
        $options = array_keys($this->avatarCatalog()[$gender] ?? []);

        if ($options === []) {
            return null;
        }

        return $options[array_rand($options)];
    }

    private function ensureValidSupervisor(int $companyId, int $supervisorUserId): void
    {
        $this->ensureUserInCompanyWithRole($companyId, $supervisorUserId, ['supervisor', 'admin', 'owner']);
    }

    private function ensureUserInCompanyWithRole(int $companyId, int $userId, array $roles): void
    {
        $member = DB::table('company_users')
            ->where('company_id', $companyId)
            ->where('user_id', $userId)
            ->whereIn('role', $roles)
            ->exists();

        if (! $member) {
            throw ValidationException::withMessages([
                'user' => ['Selected user is not in the required company role context.'],
            ]);
        }
    }

    private function assignAgentsToSupervisor(int $companyId, int $supervisorUserId, array $agentIds): void
    {
        foreach ($agentIds as $agentId) {
            $this->ensureUserInCompanyWithRole($companyId, (int) $agentId, ['agent']);

            User::query()->whereKey((int) $agentId)->update([
                'supervisor_user_id' => $supervisorUserId,
            ]);
        }
    }
}
