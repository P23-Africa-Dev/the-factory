<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Facades\Storage;

class AvatarUrlResolver
{
    public static function resolve(mixed $avatar, mixed $gender = null): ?string
    {
        if ($avatar === null) {
            return null;
        }

        $avatarValue = trim((string) $avatar);

        if ($avatarValue === '') {
            return null;
        }

        if (str_starts_with($avatarValue, '/') || preg_match('/^https?:\/\//i', $avatarValue) === 1) {
            return $avatarValue;
        }

        $publicBaseUrl = rtrim((string) (
            config('internal_onboarding.avatar_public_base_url')
            ?: config('filesystems.disks.public.url')
            ?: asset('storage')
        ), '/');

        $avatarRoot = trim((string) config('internal_onboarding.avatar_storage_root', 'avatar'), '/');
        $publicDisk = Storage::disk('public');

        if (str_starts_with($avatarValue, "{$avatarRoot}/") && $publicDisk->exists($avatarValue)) {
            return $publicBaseUrl . '/' . ltrim($avatarValue, '/');
        }

        if (str_starts_with($avatarValue, "{$avatarRoot}/custom/")) {
            return $publicBaseUrl . '/' . ltrim($avatarValue, '/');
        }

        $avatarFilename = pathinfo($avatarValue, PATHINFO_FILENAME);
        $avatarExtension = strtolower((string) pathinfo($avatarValue, PATHINFO_EXTENSION));

        $candidateKeys = array_values(array_unique(array_filter([
            $avatarValue,
            $avatarFilename,
        ], static fn($value): bool => is_string($value) && trim($value) !== '')));

        $candidateGenders = [];
        if ($gender !== null && trim((string) $gender) !== '') {
            $candidateGenders[] = strtolower((string) $gender);
        }
        $candidateGenders = array_values(array_unique(array_filter(array_merge($candidateGenders, ['male', 'female']))));

        $candidateExtensions = ['png', 'svg'];
        if ($avatarExtension !== '' && in_array($avatarExtension, $candidateExtensions, true)) {
            array_unshift($candidateExtensions, $avatarExtension);
            $candidateExtensions = array_values(array_unique($candidateExtensions));
        }

        foreach ($candidateGenders as $candidateGender) {
            foreach ($candidateKeys as $candidateKey) {
                foreach ($candidateExtensions as $candidateExtension) {
                    $candidatePath = "{$avatarRoot}/{$candidateGender}/{$candidateKey}.{$candidateExtension}";

                    if ($publicDisk->exists($candidatePath)) {
                        return $publicBaseUrl . '/' . ltrim($candidatePath, '/');
                    }
                }
            }
        }

        return null;
    }
}
