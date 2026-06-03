<?php

declare(strict_types=1);

namespace App\Services\Profile;

use App\Models\Company;
use App\Models\User;
use App\Services\Company\CompanyContextService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ProfileService
{
    public function __construct(private readonly CompanyContextService $companyContextService) {}

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

        if (isset($payload['avatar_file']) && $payload['avatar_file'] instanceof UploadedFile) {
            $nextAvatar = $this->storeCustomAvatar($payload['avatar_file'], (int) $user->id);
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

        $user->forceFill([
            'avatar' => $nextAvatar,
            'gender' => $nextGender,
        ])->save();

        $this->cleanupPreviousCustomAvatar($previousAvatar, $nextAvatar);

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

        if ($normalizedAvatarKey === '' || $this->isCustomAvatarPath($normalizedAvatarKey)) {
            throw ValidationException::withMessages([
                'avatar_key' => ['Selected avatar key is invalid.'],
            ]);
        }

        $catalog = $this->avatarCatalog();

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

    private function avatarCatalog(): array
    {
        $catalog = [
            'male' => [],
            'female' => [],
        ];

        $disk = Storage::disk('public');
        $basePath = trim((string) config('internal_onboarding.avatar_storage_root', 'avatar'), '/');

        foreach (['male', 'female'] as $gender) {
            foreach ($disk->files("{$basePath}/{$gender}") as $file) {
                $filename = basename($file);
                $extension = strtolower((string) pathinfo($filename, PATHINFO_EXTENSION));

                if (! in_array($extension, ['png', 'svg', 'jpg', 'jpeg', 'webp'], true)) {
                    continue;
                }

                $key = pathinfo($filename, PATHINFO_FILENAME);
                $catalog[$gender][$key] = true;
            }
        }

        $fallbackCatalog = config('internal_onboarding.avatar_catalog', []);
        if (! is_array($fallbackCatalog)) {
            $fallbackCatalog = [];
        }
        foreach ($fallbackCatalog as $gender => $avatars) {
            if (! isset($catalog[$gender]) || ! is_array($avatars)) {
                continue;
            }

            foreach ($avatars as $avatarKey => $_svg) {
                $catalog[$gender][$avatarKey] = true;
            }
        }

        return $catalog;
    }

    private function storeCustomAvatar(UploadedFile $avatarFile, int $userId): string
    {
        $basePath = trim((string) config('internal_onboarding.avatar_storage_root', 'avatar'), '/');
        $directory = "{$basePath}/custom";
        $extension = strtolower($avatarFile->getClientOriginalExtension() ?: $avatarFile->extension() ?: 'png');
        $filename = sprintf('user_%d_%s.%s', $userId, Str::random(16), $extension);

        return $avatarFile->storeAs($directory, $filename, ['disk' => 'public']);
    }

    private function cleanupPreviousCustomAvatar(?string $previousAvatar, ?string $nextAvatar): void
    {
        if (! is_string($previousAvatar) || trim($previousAvatar) === '') {
            return;
        }

        if ($previousAvatar === $nextAvatar) {
            return;
        }

        if (! $this->isCustomAvatarPath($previousAvatar)) {
            return;
        }

        $disk = Storage::disk('public');

        if ($disk->exists($previousAvatar)) {
            $disk->delete($previousAvatar);
        }
    }

    private function isCustomAvatarPath(string $avatarKey): bool
    {
        $basePath = trim((string) config('internal_onboarding.avatar_storage_root', 'avatar'), '/');

        return str_starts_with($avatarKey, "{$basePath}/custom/");
    }

    private function canEditCountry(string $membershipRole): bool
    {
        return in_array($membershipRole, ['owner', 'admin'], true);
    }
}
