<?php

declare(strict_types=1);

namespace App\Services\Profile;

use App\Models\Company;
use App\Models\User;
use App\Services\Avatar\AvatarStorageService;
use App\Services\Company\CompanyContextService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ProfileService
{
    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly AvatarStorageService $avatarStorage,
    ) {}

    public function show(User $user, ?int $companyId = null): array
    {
        return $this->buildPayload($user, $companyId);
    }

    public function update(User $user, array $payload): array
    {
        $companyId = isset($payload['company_id']) ? (int) $payload['company_id'] : null;
        $context = $this->companyContextService->resolve($user, $companyId);

        /** @var Company $company */
        $company = $context['company'];
        $membershipRole = (string) $context['role'];

        $canEditCountry = $this->canEditCountry($membershipRole);

        if (array_key_exists('country', $payload) && ! $canEditCountry) {
            throw ValidationException::withMessages([
                'country' => ['You are not allowed to update company country.'],
            ]);
        }

        $userUpdates = [];
        foreach (['name', 'phone_number', 'gender'] as $field) {
            if (array_key_exists($field, $payload)) {
                $userUpdates[$field] = $payload[$field];
            }
        }

        if ($userUpdates !== []) {
            $user->fill($userUpdates);

            if ($user->isDirty()) {
                $user->save();
            }
        }

        if ($canEditCountry && array_key_exists('country', $payload)) {
            $newCountry = strtoupper((string) $payload['country']);

            if ($company->country !== $newCountry) {
                $company->forceFill(['country' => $newCountry])->save();
            }
        }

        return $this->buildPayload($user->fresh(), $company->id);
    }

    public function updateAvatar(User $user, array $payload): array
    {
        $companyId = isset($payload['company_id']) ? (int) $payload['company_id'] : null;
        $this->companyContextService->resolve($user, $companyId);

        $previousAvatar = $user->avatar;
        $nextAvatar = $previousAvatar;
        $nextGender = $user->gender;
        $uploadedPath = null;

        try {
            if (isset($payload['avatar_file']) && $payload['avatar_file'] instanceof UploadedFile) {
                $uploadedPath = $this->avatarStorage->storeCustom($payload['avatar_file'], (int) $user->id);
                $nextAvatar = $uploadedPath;
                if (array_key_exists('gender', $payload)) {
                    $nextGender = $payload['gender'];
                }
            } elseif (isset($payload['avatar_key']) && is_string($payload['avatar_key'])) {
                [$resolvedAvatarKey, $resolvedGender] = $this->resolveCatalogAvatarSelection(
                    avatarKey: $payload['avatar_key'],
                    preferredGender: $payload['gender'] ?? $user->gender,
                );

                $nextAvatar = $resolvedAvatarKey;
                $nextGender = $resolvedGender;
            }

            DB::transaction(function () use ($user, $nextAvatar, $nextGender): void {
                $user->forceFill([
                    'avatar' => $nextAvatar,
                    'gender' => $nextGender,
                ])->save();
            });
        } catch (\Throwable $exception) {
            if (is_string($uploadedPath) && $uploadedPath !== '') {
                $this->avatarStorage->deleteIfOrphaned($uploadedPath);
            }

            throw $exception;
        }

        $this->avatarStorage->replaceCustomAvatar($previousAvatar, $nextAvatar);

        return $this->buildPayload($user->fresh(), $companyId);
    }

    private function buildPayload(User $user, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);

        /** @var Company $company */
        $company = $context['company'];
        $role = (string) $context['role'];

        $membership = DB::table('company_users')
            ->where('company_id', $company->id)
            ->where('user_id', $user->id)
            ->first(['joined_at', 'created_at']);

        $selfServeCompleted = $user->hasCompletedOnboarding();
        $enterpriseCompleted = $user->hasCompletedEnterpriseOnboarding();
        $internalCompleted = $user->hasCompletedInternalOnboarding();

        $userType = match (true) {
            $selfServeCompleted => 'self-serve',
            $enterpriseCompleted => 'enterprise',
            $internalCompleted => 'internal',
            default => null,
        };

        return [
            'user' => $user,
            'company' => $company,
            'membership_role' => $role,
            'membership_joined_at' => $membership?->joined_at ?? $membership?->created_at,
            'user_type' => $userType,
            'onboarding' => [
                'completed' => $selfServeCompleted || $enterpriseCompleted || $internalCompleted,
                'self_serve_completed' => $selfServeCompleted,
                'enterprise_completed' => $enterpriseCompleted,
                'internal_completed' => $internalCompleted,
                'self_serve_completed_at' => $user->onboarding_completed_at?->toIso8601String(),
                'enterprise_completed_at' => $user->enterprise_onboarding_completed_at?->toIso8601String(),
                'internal_completed_at' => $user->internal_onboarding_completed_at?->toIso8601String(),
            ],
            'permissions' => [
                'can_edit_name' => true,
                'can_edit_phone_number' => true,
                'can_edit_gender' => true,
                'can_edit_country' => $this->canEditCountry($role),
                'can_edit_email' => false,
                'can_edit_role' => false,
                'can_edit_company' => false,
                'can_edit_membership' => false,
            ],
        ];
    }

    /**
     * @return array{0: string, 1: string|null}
     */
    private function resolveCatalogAvatarSelection(string $avatarKey, ?string $preferredGender): array
    {
        $normalizedAvatarKey = trim(pathinfo($avatarKey, PATHINFO_FILENAME));

        if ($normalizedAvatarKey === '' || $this->avatarStorage->isCustomAvatarPath($normalizedAvatarKey)) {
            throw ValidationException::withMessages([
                'avatar_key' => ['Selected avatar key is invalid.'],
            ]);
        }

        $catalog = $this->avatarStorage->catalog();

        $matchingGenders = [];
        foreach (['male', 'female'] as $gender) {
            if (isset($catalog[$gender][$normalizedAvatarKey])) {
                $matchingGenders[] = $gender;
            }
        }

        if ($matchingGenders === []) {
            throw ValidationException::withMessages([
                'avatar_key' => ['Selected avatar does not exist in the avatar catalog.'],
            ]);
        }

        $resolvedGender = null;
        $normalizedPreferredGender = $preferredGender !== null ? strtolower(trim($preferredGender)) : null;

        if ($normalizedPreferredGender !== null && $normalizedPreferredGender !== '') {
            if (! in_array($normalizedPreferredGender, $matchingGenders, true)) {
                throw ValidationException::withMessages([
                    'avatar_key' => ['Selected avatar does not match selected gender.'],
                ]);
            }

            $resolvedGender = $normalizedPreferredGender;
        } else {
            $resolvedGender = $matchingGenders[0] ?? null;
        }

        return [$normalizedAvatarKey, $resolvedGender];
    }

    private function canEditCountry(string $membershipRole): bool
    {
        return in_array($membershipRole, ['owner', 'admin'], true);
    }
}
