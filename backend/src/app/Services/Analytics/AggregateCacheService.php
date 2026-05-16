<?php

declare(strict_types=1);

namespace App\Services\Analytics;

use Closure;
use Illuminate\Support\Facades\Cache;

class AggregateCacheService
{
    public function rememberForCompany(
        int $companyId,
        string $scope,
        string $variant,
        int $ttlSeconds,
        Closure $resolver,
    ): mixed {
        $version = $this->getVersion($companyId);
        $key = sprintf('analytics:%d:%d:%s:%s', $companyId, $version, $scope, sha1($variant));

        return Cache::remember($key, $ttlSeconds, $resolver);
    }

    public function bumpCompanyVersion(int $companyId): void
    {
        Cache::increment($this->versionKey($companyId));
    }

    public function getVersion(int $companyId): int
    {
        $key = $this->versionKey($companyId);
        $current = Cache::get($key);

        if ($current === null) {
            Cache::forever($key, 1);

            return 1;
        }

        return (int) $current;
    }

    private function versionKey(int $companyId): string
    {
        return 'analytics:company:' . $companyId . ':version';
    }
}
