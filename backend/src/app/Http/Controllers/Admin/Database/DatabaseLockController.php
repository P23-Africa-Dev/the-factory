<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Database;

use App\Http\Controllers\Controller;
use App\Models\Admin;
use App\Services\Admin\AdminActionLogger;
use App\Services\Admin\Database\DatabasePasscodeService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\View\View;

class DatabaseLockController extends Controller
{
    public function __construct(
        private readonly DatabasePasscodeService $passcodes,
        private readonly AdminActionLogger $logger,
    ) {}

    public function show(Request $request): View
    {
        return view('admin.database.lock', [
            'configured' => $this->passcodes->isConfigured(),
            'rotatedAt' => $this->passcodes->rotatedAt(),
            'masterTokenConfigured' => $this->passcodes->isMasterTokenConfigured(),
        ]);
    }

    public function unlock(Request $request): RedirectResponse
    {
        $data = $request->validate(['passcode' => ['required', 'string', 'min:4', 'max:255']]);
        $adminId = auth('admin')->id();
        $key = 'db-manager-unlock:' . $adminId . ':' . $request->ip();

        if (RateLimiter::tooManyAttempts($key, 5)) {
            return back()->withErrors(['passcode' => 'Too many attempts. Try again in a minute.']);
        }

        if (! $this->passcodes->isConfigured()) {
            return back()->withErrors(['passcode' => 'No passcode is set. Reset it using the master token first.']);
        }

        if (! $this->passcodes->verify($data['passcode'])) {
            RateLimiter::hit($key, 60);
            $this->logger->log('db_manager.unlock.failed');
            return back()->withErrors(['passcode' => 'Invalid passcode.']);
        }

        RateLimiter::clear($key);
        $request->session()->put(config('admin_database.session_unlock_key'), now()->toIso8601String());
        $request->session()->put(config('admin_database.session_unlock_admin_key'), $adminId);
        $this->logger->log('db_manager.unlock.success');

        return redirect()->route('admin.database.index');
    }

    public function lock(Request $request): RedirectResponse
    {
        $request->session()->forget([
            config('admin_database.session_unlock_key'),
            config('admin_database.session_unlock_admin_key'),
        ]);
        $this->logger->log('db_manager.lock');
        return redirect()->route('admin.database.lock.show')->with('status', 'Database manager locked.');
    }

    public function changePasscode(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'current_passcode' => ['required', 'string'],
            'new_passcode' => ['required', 'string', 'min:8', 'max:255', 'confirmed'],
        ]);

        if (! $this->passcodes->verify($data['current_passcode'])) {
            return back()->withErrors(['current_passcode' => 'Current passcode is incorrect.']);
        }

        /** @var Admin $admin */
        $admin = auth('admin')->user();
        $this->passcodes->setPasscode($data['new_passcode'], $admin);
        $this->logger->log('db_manager.passcode.changed');

        return redirect()->route('admin.database.index')->with('status', 'Passcode updated.');
    }

    public function resetWithMasterToken(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'master_token' => ['required', 'string'],
            'new_passcode' => ['required', 'string', 'min:8', 'max:255', 'confirmed'],
        ]);

        $key = 'db-manager-master-reset:' . $request->ip();
        if (RateLimiter::tooManyAttempts($key, 3)) {
            return back()->withErrors(['master_token' => 'Too many attempts. Try again later.']);
        }

        if (! $this->passcodes->isMasterTokenConfigured()) {
            return back()->withErrors(['master_token' => 'Master reset token is not configured on this environment.']);
        }

        if (! $this->passcodes->verifyMasterToken($data['master_token'])) {
            RateLimiter::hit($key, 300);
            $this->logger->log('db_manager.passcode.reset.failed');
            return back()->withErrors(['master_token' => 'Invalid master reset token.']);
        }

        RateLimiter::clear($key);
        /** @var Admin $admin */
        $admin = auth('admin')->user();
        $this->passcodes->setPasscode($data['new_passcode'], $admin);
        $this->logger->log('db_manager.passcode.reset.success');

        return redirect()->route('admin.database.lock.show')
            ->with('status', 'Passcode has been reset. Enter the new passcode to unlock.');
    }
}
