<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Services\Avatar\AvatarStorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\ValidationException;

class AvatarController
{
    public function __construct(private readonly AvatarStorageService $avatarStorage) {}

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

        $avatarPath = "{$this->avatarStorage->avatarRoot()}/{$normalizedGender}";
        $disk = $this->avatarStorage->disk();

        if (! $disk->exists($avatarPath)) {
            $manifest = $this->avatarStorage->catalogManifest($normalizedGender);

            if ($manifest === []) {
                throw ValidationException::withMessages([
                    'gender' => ['No avatars available for this gender.'],
                ]);
            }
        }

        $manifestCacheKey = sprintf('internal_onboarding.avatar_manifest.%s', $normalizedGender);

        $manifest = Cache::remember($manifestCacheKey, now()->addMinutes(15), function () use ($normalizedGender): array {
            return $this->avatarStorage->catalogManifest($normalizedGender);
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
