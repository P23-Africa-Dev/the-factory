<?php

namespace App\Http\Controllers\Admin\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\LoginRequest;
use App\Models\Admin;
use App\Services\Security\SecurityAuditLogger;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\View\View;

class LoginController extends Controller
{
    public function __construct(
        private readonly SecurityAuditLogger $securityAudit,
    ) {}

    public function show(): View
    {
        return view('admin.auth.login');
    }

    public function store(LoginRequest $request): RedirectResponse
    {
        $email = strtolower(trim((string) $request->validated('email')));
        $password = (string) $request->validated('password');
        $remember = (bool) $request->boolean('remember');

        $credentials = [
            'email' => $email,
            'password' => $password,
        ];

        if (! Auth::guard('admin')->attempt($credentials, $remember)) {
            /** @var Admin|null $candidate */
            $candidate = Admin::whereRaw('LOWER(email) = ?', [$email])->first();

            if (! $candidate) {
                Log::warning('Admin web login failed: admin user not found.', [
                    'email' => $email,
                    'ip' => $request->ip(),
                ]);
                $this->securityAudit->adminWebLogin(SecurityAuditLogger::FAILURE, null, $email, [
                    'reason' => 'user_not_found',
                ]);
            } else {
                $passwordMatches = Hash::check($password, (string) $candidate->password);

                Log::warning('Admin web login failed: credential mismatch.', [
                    'admin_id' => $candidate->id,
                    'email' => $email,
                    'ip' => $request->ip(),
                    'password_matches_hash' => $passwordMatches,
                    'is_active' => (bool) $candidate->is_active,
                ]);
                $this->securityAudit->adminWebLogin(SecurityAuditLogger::FAILURE, $candidate, $email, [
                    'reason' => 'invalid_credentials',
                ]);
            }

            return back()
                ->withInput(['email' => $email])
                ->withErrors(['email' => 'Invalid credentials.']);
        }

        $request->session()->regenerate();

        /** @var Admin $admin */
        $admin = Auth::guard('admin')->user();

        if (! $admin->is_active) {
            Auth::guard('admin')->logout();
            $this->securityAudit->adminWebLogin(SecurityAuditLogger::FAILURE, $admin, $email, [
                'reason' => 'inactive',
            ]);

            return back()->withErrors(['email' => 'Your admin account is inactive.']);
        }

        $admin->update(['last_login_at' => now()]);
        $this->securityAudit->adminWebLogin(SecurityAuditLogger::SUCCESS, $admin, $email);

        return redirect()->route('admin.dashboard');
    }

    public function destroy(): RedirectResponse
    {
        $admin = Auth::guard('admin')->user();
        if ($admin instanceof Admin) {
            $this->securityAudit->log(
                action: SecurityAuditLogger::LOGOUT,
                result: SecurityAuditLogger::SUCCESS,
                channel: SecurityAuditLogger::CHANNEL_ADMIN_WEB,
                adminId: (int) $admin->id,
                email: $admin->email,
            );
        }

        Auth::guard('admin')->logout();
        request()->session()->invalidate();
        request()->session()->regenerateToken();

        return redirect()->route('admin.login.show');
    }
}
