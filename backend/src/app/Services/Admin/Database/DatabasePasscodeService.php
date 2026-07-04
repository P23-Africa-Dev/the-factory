<?php

declare(strict_types=1);

namespace App\Services\Admin\Database;

use App\Models\Admin;
use App\Models\PlatformSetting;
use Illuminate\Support\Facades\Hash;

class DatabasePasscodeService
{
    public const PASSCODE_KEY = 'database_manager.passcode_hash';
    public const ROTATED_AT_KEY = 'database_manager.rotated_at';
    public const ROTATED_BY_KEY = 'database_manager.rotated_by_admin_id';

    public function isConfigured(): bool
    {
        return PlatformSetting::getValue(self::PASSCODE_KEY) !== null;
    }

    public function verify(string $passcode): bool
    {
        $hash = PlatformSetting::getValue(self::PASSCODE_KEY);
        if ($hash === null || $hash === '') {
            return false;
        }

        return Hash::check($passcode, $hash);
    }

    public function setPasscode(string $passcode, Admin $admin): void
    {
        $trimmed = trim($passcode);
        PlatformSetting::setValue(self::PASSCODE_KEY, Hash::make($trimmed), $admin->id);
        PlatformSetting::setValue(self::ROTATED_AT_KEY, now()->toIso8601String(), $admin->id);
        PlatformSetting::setValue(self::ROTATED_BY_KEY, (string) $admin->id, $admin->id);
    }

    public function verifyMasterToken(string $token): bool
    {
        $expected = trim((string) config('admin_database.master_reset_token', ''));
        if ($expected === '') {
            return false;
        }

        return hash_equals($expected, trim($token));
    }

    public function isMasterTokenConfigured(): bool
    {
        return trim((string) config('admin_database.master_reset_token', '')) !== '';
    }

    public function rotatedAt(): ?string
    {
        return PlatformSetting::getValue(self::ROTATED_AT_KEY);
    }
}
