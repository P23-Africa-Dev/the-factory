<?php

namespace App\Services\Auth;

use App\Enums\VerificationType;
use App\Models\UserVerification;

class OtpService
{
    private const OTP_LENGTH = 6;

    private const OTP_TTL_MINUTES = 10;

    private const COOLDOWN_SECONDS = 60;

    /**
     * Generate a new OTP, invalidate previous unused ones, and persist the hash.
     */
    public function generate(
        string $email,
        string $type = VerificationType::REGISTRATION->value,
        ?string $ipAddress = null,
    ): string {
        // Soft-invalidate all previous unused OTPs for this email + type
        UserVerification::where('email', $email)
            ->where('type', $type)
            ->whereNull('used_at')
            ->update(['used_at' => now()]);

        $otp = str_pad((string) random_int(0, 999_999), self::OTP_LENGTH, '0', STR_PAD_LEFT);

        UserVerification::create([
            'email' => $email,
            'otp_code' => $this->hash($otp),
            'type' => $type,
            'ip_address' => $ipAddress,
            'expires_at' => now()->addMinutes(self::OTP_TTL_MINUTES),
            'used_at' => null,
        ]);

        return $otp;
    }

    /**
     * Verify the provided OTP. Returns true on success and marks it as used.
     */
    public function verify(
        string $email,
        string $otp,
        string $type = VerificationType::REGISTRATION->value,
    ): bool {
        $verification = UserVerification::where('email', $email)
            ->where('type', $type)
            ->whereNull('used_at')
            ->where('expires_at', '>', now())
            ->latest()
            ->first();

        if (! $verification) {
            return false;
        }

        // Constant-time comparison to prevent timing attacks
        if (! hash_equals($verification->otp_code, $this->hash($otp))) {
            return false;
        }

        $verification->markAsUsed();

        return true;
    }

    /**
     * Check whether an OTP was already requested within the cooldown window.
     */
    public function isWithinCooldown(string $email, string $type): bool
    {
        return UserVerification::where('email', $email)
            ->where('type', $type)
            ->where('created_at', '>', now()->subSeconds(self::COOLDOWN_SECONDS))
            ->exists();
    }

    /**
     * Invalidate the latest unused OTP to avoid keeping unsent active codes.
     */
    public function invalidateLatestUnused(string $email, string $type): void
    {
        UserVerification::where('email', $email)
            ->where('type', $type)
            ->whereNull('used_at')
            ->latest()
            ->limit(1)
            ->update(['used_at' => now()]);
    }

    private function hash(string $otp): string
    {
        return hash_hmac('sha256', $otp, config('app.key'));
    }
}
