<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
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

        $cacheKey = sprintf('internal_onboarding.avatars.%s', $normalizedGender);

        $avatars = Cache::remember($cacheKey, now()->addMinutes(15), function () use (
            $disk,
            $avatarPath,
            $publicBaseUrl,
            $normalizedGender,
        ): array {
            $files = $disk->files($avatarPath);
            sort($files);

            $items = [];
            $diskKeys = [];

            foreach ($files as $file) {
                $filename = basename($file);
                $extension = strtolower((string) pathinfo($filename, PATHINFO_EXTENSION));

                if (! in_array($extension, ['png', 'svg'], true)) {
                    continue;
                }

                $key = pathinfo($filename, PATHINFO_FILENAME);
                $url = $publicBaseUrl . '/' . ltrim($file, '/');
                $svgContent = null;

                if ($extension === 'svg') {
                    try {
                        $svgContent = $disk->get($file);
                    } catch (\Throwable) {
                        // Non-fatal: URL fallback will be used.
                    }
                }

                $items[] = [
                    'key' => $key,
                    'url' => $url,
                    'svg' => $svgContent,
                ];

                $diskKeys[] = $key;
            }

            // Include SVG-only catalog entries whose keys are not already covered by disk files.
            $svgCatalog = config("internal_onboarding.avatar_catalog.{$normalizedGender}", []);

            foreach ($svgCatalog as $catalogKey => $svg) {
                if (! in_array($catalogKey, $diskKeys, true)) {
                    $items[] = [
                        'key' => $catalogKey,
                        'url' => null,
                        'svg' => $svg,
                    ];
                }
            }

            return $items;
        });

        return response()->json([
            'success' => true,
            'data'    => $avatars,
        ]);
    }
}
