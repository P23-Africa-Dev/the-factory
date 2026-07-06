<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Company;
use App\Models\User;
use App\Support\LoginRateLimiter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class LoginRateLimitTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create([
            'company_id' => 'FAC-RATE-LIMIT',
            'name' => 'Rate Limit Co',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '2-10',
            'use_case' => 'Access control',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $userA = User::factory()->create([
            'email' => 'user-a@example.com',
            'password' => bcrypt('password123'),
            'is_active' => true,
            'internal_role' => null,
            'onboarding_completed_at' => now(),
        ]);

        $userB = User::factory()->create([
            'email' => 'user-b@example.com',
            'password' => bcrypt('password123'),
            'is_active' => true,
            'internal_role' => null,
            'onboarding_completed_at' => now(),
        ]);

        foreach ([$userA, $userB] as $user) {
            DB::table('company_users')->insert([
                'company_id' => $company->id,
                'user_id' => $user->id,
                'role' => 'owner',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function test_login_rate_limit_is_per_email_not_global(): void
    {
        for ($i = 0; $i < LoginRateLimiter::EMAIL_IP_MAX_ATTEMPTS; $i++) {
            $this->postJson('/api/v1/auth/login', [
                'email' => 'user-a@example.com',
                'password' => 'wrong-password',
            ])->assertStatus(401);
        }

        $this->postJson('/api/v1/auth/login', [
            'email' => 'user-a@example.com',
            'password' => 'wrong-password',
        ])
            ->assertStatus(429)
            ->assertHeader('Retry-After');

        $this->postJson('/api/v1/auth/login', [
            'email' => 'user-b@example.com',
            'password' => 'wrong-password',
        ])->assertStatus(401);
    }

    public function test_successful_login_clears_rate_limit(): void
    {
        for ($i = 0; $i < LoginRateLimiter::EMAIL_IP_MAX_ATTEMPTS - 1; $i++) {
            $this->postJson('/api/v1/auth/login', [
                'email' => 'user-a@example.com',
                'password' => 'wrong-password',
            ])->assertStatus(401);
        }

        $this->postJson('/api/v1/auth/login', [
            'email' => 'user-a@example.com',
            'password' => 'password123',
        ])->assertOk();

        $this->postJson('/api/v1/auth/login', [
            'email' => 'user-a@example.com',
            'password' => 'password123',
        ])->assertOk();
    }

    public function test_login_returns_429_with_retry_after_after_limit(): void
    {
        for ($i = 0; $i < LoginRateLimiter::EMAIL_IP_MAX_ATTEMPTS; $i++) {
            $this->postJson('/api/v1/auth/login', [
                'email' => 'user-a@example.com',
                'password' => 'wrong-password',
            ]);
        }

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'user-a@example.com',
            'password' => 'wrong-password',
        ]);

        $response->assertStatus(429)
            ->assertJsonPath('success', false)
            ->assertJsonStructure(['message'])
            ->assertHeader('Retry-After');

        $this->assertStringContainsString(
            'Too many failed login attempts',
            (string) $response->json('message')
        );
    }
}
