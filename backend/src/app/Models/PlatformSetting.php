<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Cache;

class PlatformSetting extends Model
{
    use HasFactory;

    private const CACHE_PREFIX = 'platform_settings.';

    protected $fillable = [
        'key',
        'value',
        'updated_by_admin_id',
    ];

    public function updatedByAdmin(): BelongsTo
    {
        return $this->belongsTo(Admin::class, 'updated_by_admin_id');
    }

    public static function getValue(string $key): ?string
    {
        return Cache::rememberForever(self::cacheKey($key), function () use ($key): ?string {
            return self::query()->where('key', $key)->value('value');
        });
    }

    public static function setValue(string $key, string $value, ?int $updatedByAdminId = null): self
    {
        $setting = self::query()->updateOrCreate(
            ['key' => $key],
            [
                'value' => $value,
                'updated_by_admin_id' => $updatedByAdminId,
            ]
        );

        Cache::forever(self::cacheKey($key), $value);

        return $setting;
    }

    public static function forgetValue(string $key): void
    {
        Cache::forget(self::cacheKey($key));
    }

    private static function cacheKey(string $key): string
    {
        return self::CACHE_PREFIX . str_replace('.', '_', $key);
    }
}
