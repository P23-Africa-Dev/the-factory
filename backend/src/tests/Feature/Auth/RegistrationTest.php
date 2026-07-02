<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Notifications\OtpNotification;
use App\Services\Auth\OtpService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class RegistrationTest extends TestCase
{
    use RefreshDatabase;

    // -----------------------------------------------------------------------
    // Happy path
    // -----------------------------------------------------------------------

    public function test_new_user_can_register_and_receives_otp(): void
    {
        Notification::fake();

        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Jane Doe',
            'email' => 'jane@example.com',
            'password' => 'Secret123',
            'password_confirmation' => 'Secret123',
        ]);

        $response->assertStatus(201)
            ->assertJson([
                'success' => true,
                'message' => 'Verification code sent. Please check your email.',
            ])
            ->assertJsonStructure([
                'data' => ['email'],
            ]);

        $this->assertDatabaseHas('users', ['email' => 'jane@example.com', 'name' => 'Jane Doe']);
        $this->assertDatabaseHas('user_verifications', ['email' => 'jane@example.com', 'type' => 'registration']);

        $registeredUser = User::where('email', 'jane@example.com')->first();

        Notification::assertSentTo(
            $registeredUser,
            OtpNotification::class,
            function (OtpNotification $notification, array $channels) use ($registeredUser): bool {
                $mailMessage = $notification->toMail($registeredUser);

                return in_array('mail', $channels, true)
                    && $mailMessage->mailer === 'resend';
            },
        );
    }

    public function test_email_in_response_is_masked(): void
    {
        Notification::fake();

        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Jane Doe',
            'email' => 'jane@example.com',
            'password' => 'Secret123',
            'password_confirmation' => 'Secret123',
        ]);

        $response->assertStatus(201);
        $email = $response->json('data.email');

        // Must not expose the full local part
        $this->assertStringNotContainsString('ane', $email);
        $this->assertStringContainsString('@example.com', $email);
    }

    // -----------------------------------------------------------------------
    // Validation failures
    // -----------------------------------------------------------------------

    public function test_registration_fails_with_invalid_email(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Jane Doe',
            'email' => 'not-an-email',
        ]);

        $response->assertUnprocessable()
            ->assertJson(['success' => false])
            ->assertJsonStructure(['errors' => ['email']]);
    }

    public function test_registration_fails_without_required_fields(): void
    {
        $response = $this->postJson('/api/v1/auth/register', []);

        $response->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['name', 'email', 'password']]);
    }

    public function test_registration_fails_when_name_is_too_short(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'J',
            'email' => 'j@example.com',
        ]);

        $response->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['name']]);
    }

    // -----------------------------------------------------------------------
    // Re-registration (returning unverified user)
    // -----------------------------------------------------------------------

    public function test_re_registration_updates_name_and_resends_otp(): void
    {
        Notification::fake();

        User::factory()->create([
            'name' => 'Old Name',
            'email' => 'jane@example.com',
            'email_verified_at' => null,
        ]);

        $this->postJson('/api/v1/auth/register', [
            'name' => 'Jane Doe',
            'email' => 'jane@example.com',
            'password' => 'Secret123',
            'password_confirmation' => 'Secret123',
        ])->assertStatus(201);

        $this->assertDatabaseHas('users', ['email' => 'jane@example.com', 'name' => 'Jane Doe']);
        $this->assertSame(1, User::where('email', 'jane@example.com')->count());
    }

    public function test_registration_can_reuse_email_from_soft_deleted_user(): void
    {
        Notification::fake();

        $deletedUser = User::factory()->create([
            'name' => 'Deleted Jane',
            'email' => 'reused-self-serve@example.com',
        ]);
        $deletedUser->delete();

        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'New Jane',
            'email' => 'reused-self-serve@example.com',
            'password' => 'Secret123',
            'password_confirmation' => 'Secret123',
        ]);

        $response->assertStatus(201)
            ->assertJson(['success' => true]);

        $this->assertSoftDeleted('users', ['id' => $deletedUser->id]);
        $this->assertDatabaseHas('users', [
            'email' => 'reused-self-serve@example.com',
            'name' => 'New Jane',
            'deleted_at' => null,
        ]);
        $this->assertSame(2, User::withTrashed()->where('email', 'reused-self-serve@example.com')->count());
    }

    // -----------------------------------------------------------------------
    // Password validation
    // -----------------------------------------------------------------------

    public function test_registration_fails_without_password(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Jane Doe',
            'email' => 'jane@example.com',
        ]);

        $response->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['password']]);
    }

    public function test_registration_fails_when_password_too_short(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Jane Doe',
            'email' => 'jane@example.com',
            'password' => 'abc1',
            'password_confirmation' => 'abc1',
        ]);

        $response->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['password']]);
    }

    public function test_registration_fails_when_password_has_no_letters(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Jane Doe',
            'email' => 'jane@example.com',
            'password' => '12345678',
            'password_confirmation' => '12345678',
        ]);

        $response->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['password']]);
    }

    public function test_registration_fails_when_password_has_no_numbers(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Jane Doe',
            'email' => 'jane@example.com',
            'password' => 'NoNumbers!',
            'password_confirmation' => 'NoNumbers!',
        ]);

        $response->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['password']]);
    }

    public function test_registration_fails_when_passwords_do_not_match(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Jane Doe',
            'email' => 'jane@example.com',
            'password' => 'Secret123',
            'password_confirmation' => 'Different123',
        ]);

        $response->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['password_confirmation']]);
    }

    public function test_password_is_stored_hashed_after_registration(): void
    {
        Notification::fake();

        $this->postJson('/api/v1/auth/register', [
            'name' => 'Jane Doe',
            'email' => 'jane@example.com',
            'password' => 'Secret123',
            'password_confirmation' => 'Secret123',
        ])->assertStatus(201);

        $user = User::where('email', 'jane@example.com')->firstOrFail();
        $this->assertNotNull($user->password);
        $this->assertNotEquals('Secret123', $user->password);
        $this->assertTrue(password_verify('Secret123', $user->password));
    }

    public function test_re_registration_updates_password(): void
    {
        Notification::fake();

        User::factory()->create([
            'name' => 'Jane Doe',
            'email' => 'jane@example.com',
            'password' => bcrypt('OldPassword1'),
            'email_verified_at' => null,
        ]);

        $this->postJson('/api/v1/auth/register', [
            'name' => 'Jane Doe',
            'email' => 'jane@example.com',
            'password' => 'NewSecret9',
            'password_confirmation' => 'NewSecret9',
        ])->assertStatus(201);

        $user = User::where('email', 'jane@example.com')->firstOrFail();
        $this->assertTrue(password_verify('NewSecret9', $user->password));
        $this->assertFalse(password_verify('OldPassword1', $user->password));
    }

    public function test_registration_does_not_reset_password_for_completed_self_serve_user(): void
    {
        Notification::fake();

        User::factory()->create([
            'name' => 'Existing User',
            'email' => 'existing@example.com',
            'password' => bcrypt('ExistingPass9'),
            'email_verified_at' => now(),
            'onboarding_completed_at' => now(),
        ]);

        $this->postJson('/api/v1/auth/register', [
            'name' => 'Updated Name',
            'email' => 'existing@example.com',
            'password' => 'NewSecret9',
            'password_confirmation' => 'NewSecret9',
        ])->assertStatus(201);

        $user = User::where('email', 'existing@example.com')->firstOrFail();

        $this->assertSame('Existing User', $user->name);
        $this->assertTrue(password_verify('ExistingPass9', $user->password));
        $this->assertFalse(password_verify('NewSecret9', $user->password));
    }

    public function test_user_can_login_with_registration_password_after_onboarding_completion(): void
    {
        Notification::fake();

        $email = 'newselfserve@example.com';
        $password = 'Secure123';

        $this->postJson('/api/v1/auth/register', [
            'name' => 'New User',
            'email' => $email,
            'password' => $password,
            'password_confirmation' => $password,
        ])->assertStatus(201);

        $otp = app(OtpService::class)->generate($email, 'registration');

        $verifyResponse = $this->postJson('/api/v1/auth/verify-email', [
            'email' => $email,
            'otp_code' => $otp,
        ])->assertOk();

        $token = $verifyResponse->json('data.token');

        $this->withToken($token)->postJson('/api/v1/onboarding/workspace', [
            'company_name' => 'The Factory Labs',
            'country' => 'NG',
            'team_size' => '2-10',
            'purpose' => 'startup',
            'user_type' => 'founder',
        ])->assertStatus(201);

        $this->postJson('/api/v1/auth/login', [
            'email' => $email,
            'password' => $password,
        ])->assertOk()
            ->assertJsonPath('data.user_type', 'self-serve')
            ->assertJsonPath('data.access_role', 'admin');
    }
}
