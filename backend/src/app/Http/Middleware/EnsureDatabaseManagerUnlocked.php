<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpFoundation\Response;

class EnsureDatabaseManagerUnlocked
{
    public function handle(Request $request, Closure $next): Response
    {
        $sessionKey = (string) config('admin_database.session_unlock_key');
        $adminKey = (string) config('admin_database.session_unlock_admin_key');
        $ttlMinutes = (int) config('admin_database.unlock_ttl_minutes', 15);

        $unlockedAt = $request->session()->get($sessionKey);
        $unlockedAdminId = $request->session()->get($adminKey);
        $currentAdminId = auth('admin')->id();

        $valid = false;
        if (is_string($unlockedAt) && $currentAdminId && (int) $unlockedAdminId === (int) $currentAdminId) {
            try {
                $ts = Carbon::parse($unlockedAt);
                if ($ts->diffInMinutes(now()) < $ttlMinutes) {
                    $valid = true;
                }
            } catch (\Throwable) {
                $valid = false;
            }
        }

        if (! $valid) {
            $request->session()->forget([$sessionKey, $adminKey]);

            if ($request->expectsJson() || $request->ajax()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Database manager is locked. Enter your passcode to continue.',
                    'locked' => true,
                ], 423);
            }

            return redirect()->route('admin.database.lock.show')
                ->with('status', 'Enter your passcode to unlock the database manager.');
        }

        return $next($request);
    }
}
