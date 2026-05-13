<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class AvatarController
{
    /**
     * Get available avatars for a specific gender.
     *
     * @throws ValidationException
     */
    public function index(Request $request): JsonResponse
    {
        $gender = $request->query('gender');

        if ($gender === null) {
            throw ValidationException::withMessages([
                'gender' => ['Gender parameter is required.'],
            ]);
        }

        $normalizedGender = strtolower(trim($gender));

        if (! in_array($normalizedGender, ['male', 'female'], true)) {
            throw ValidationException::withMessages([
                'gender' => ['Gender must be either "male" or "female".'],
            ]);
        }

        $disk = Storage::disk('public');
        $basePath = trim((string) config('internal_onboarding.avatar_storage_root', 'avatar'), '/');
        $avatarPath = "{$basePath}/{$normalizedGender}";
        $publicBaseUrl = rtrim((string) (
            config('internal_onboarding.avatar_public_base_url')
            ?: config('filesystems.disks.public.url')
            ?: asset('storage')
        ), '/');

        if (! $disk->exists($avatarPath)) {
            throw ValidationException::withMessages([
                'gender' => ['No avatars available for this gender.'],
            ]);
        }

        $files = $disk->files($avatarPath);
        $avatarUrls = [];

        foreach ($files as $file) {
            $filename = basename($file);
            $extension = strtolower((string) pathinfo($filename, PATHINFO_EXTENSION));

            // Skip unsupported file types.
            if (! in_array($extension, ['png', 'svg'], true)) {
                continue;
            }

            $avatarUrls[] = $publicBaseUrl.'/'.ltrim($file, '/');
        }

        sort($avatarUrls);

        return response()->json([
            'success' => true,
            'data' => $avatarUrls,
        ]);
    }
}
