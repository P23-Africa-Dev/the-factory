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
        $limit = max(1, min((int) $request->query('limit', 4), 12));
        $cursor = max((int) $request->query('cursor', 0), 0);

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

        $manifestCacheKey = sprintf('internal_onboarding.avatar_manifest.%s', $normalizedGender);

        $manifest = Cache::remember($manifestCacheKey, now()->addMinutes(15), function () use (
            $disk,
            $avatarPath,
            $publicBaseUrl,
            $normalizedGender,
        ): array {
            $files = $disk->files($avatarPath);
            sort($files);

            $manifestItems = [];
            $diskKeys = [];

            foreach ($files as $file) {
                $filename = basename($file);
                $extension = strtolower((string) pathinfo($filename, PATHINFO_EXTENSION));

                if (! in_array($extension, ['png', 'svg'], true)) {
                    continue;
                }

                $key = pathinfo($filename, PATHINFO_FILENAME);
                $url = $publicBaseUrl . '/' . ltrim($file, '/');

                $manifestItems[] = [
                    'key' => $key,
                    'url' => $url,
                    'file' => $file,
                    'extension' => $extension,
                    'svg' => null,
                ];

                $diskKeys[] = $key;
            }

            // Include SVG-only catalog entries whose keys are not already covered by disk files.
            $svgCatalog = config("internal_onboarding.avatar_catalog.{$normalizedGender}", []);

            foreach ($svgCatalog as $catalogKey => $svg) {
                if (! in_array($catalogKey, $diskKeys, true)) {
                    $manifestItems[] = [
                        'key' => $catalogKey,
                        'url' => null,
                        'file' => null,
                        'extension' => 'svg',
                        'svg' => $svg,
                    ];
                }
            }

            return $manifestItems;
        });

        $total = count($manifest);
        $page = array_slice($manifest, $cursor, $limit);

        $avatars = array_map(function (array $item) use ($disk): array {
            $svgContent = is_string($item['svg'] ?? null) ? $item['svg'] : null;
            $file = $item['file'] ?? null;
            $extension = $item['extension'] ?? null;

            if ($svgContent === null && $extension === 'svg' && is_string($file)) {
                try {
                    $svgContent = $disk->get($file);
                } catch (\Throwable) {
                    // Non-fatal: URL fallback will be used.
                }
            }

            return [
                'key' => (string) $item['key'],
                'url' => $item['url'] ?? null,
                'svg' => $svgContent,
            ];
        }, $page);

        $nextCursor = ($cursor + count($page)) < $total ? $cursor + count($page) : null;

        return response()->json([
            'success' => true,
            'data'    => $avatars,
            'meta'    => [
                'cursor' => $cursor,
                'limit' => $limit,
                'next_cursor' => $nextCursor,
                'has_more' => $nextCursor !== null,
                'total' => $total,
            ],
        ]);
    }
}
