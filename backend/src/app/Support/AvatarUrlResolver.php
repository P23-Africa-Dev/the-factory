<?php

declare(strict_types=1);

namespace App\Support;

use App\Services\Avatar\AvatarStorageService;

class AvatarUrlResolver
{
    public static function resolve(mixed $avatar, mixed $gender = null): ?string
    {
        return app(AvatarStorageService::class)->resolveUrl($avatar, $gender);
    }

    public static function resolveOrDefault(mixed $avatar, mixed $gender = null): string
    {
        return app(AvatarStorageService::class)->resolveUrlOrDefault($avatar, $gender);
    }
}
