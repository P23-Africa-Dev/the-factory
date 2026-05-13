<?php

namespace App\Http\Controllers\Admin\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\LoginRequest;
use App\Models\Admin;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\View\View;

class LoginController extends Controller
{
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
            } else {
                $passwordMatches = Hash::check($password, (string) $candidate->password);

                Log::warning('Admin web login failed: credential mismatch.', [
                    'admin_id' => $candidate->id,
                    'email' => $email,
                    'ip' => $request->ip(),
                    'password_matches_hash' => $passwordMatches,
                    'is_active' => (bool) $candidate->is_active,
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

            return back()->withErrors(['email' => 'Your admin account is inactive.']);
        }

        $admin->update(['last_login_at' => now()]);

        return redirect()->route('admin.dashboard');
    }

    public function destroy(): RedirectResponse
    {
        Auth::guard('admin')->logout();
        request()->session()->invalidate();
        request()->session()->regenerateToken();

        return redirect()->route('admin.login.show');
    }
}
