<?php

declare(strict_types=1);

namespace Tests\Feature\Internal;

use App\Models\Company;
use App\Models\InternalUserInvitation;
use App\Models\User;
use App\Notifications\InternalUserOnboardingInviteNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class InternalUserOnboardingTest extends TestCase
{
    use RefreshDatabase;

    public function test_supervisor_can_create_agent_and_send_invite(): void
    {
        Notification::fake();

        [$company, $supervisor, $existingSupervisor] = $this->seedCompanyWithManagerAndSupervisor();

        $token = $supervisor->createToken('supervisor-token', ['*'])->plainTextToken;

        $response = $this->withToken($token)->postJson('/api/v1/internal-users', [
            'company_id' => $company->id,
            'full_name' => 'Field Agent One',
            'email' => 'agent1@factory.local',
            'role' => 'agent',
            'assigned_zone' => 'South Zone',
            'work_days' => ['monday', 'tuesday', 'wednesday'],
            'base_salary' => 150000,
            'currency_code' => 'NGN',
            'commission_enabled' => true,
            'supervisor_user_id' => $existingSupervisor->id,
        ]);

        $response->assertStatus(201)
            ->assertJson(['success' => true])
            ->assertJsonPath('data.user.onboarding_status', 'pending_onboarding');

        $this->assertDatabaseHas('users', [
            'email' => 'agent1@factory.local',
            'internal_role' => 'agent',
            'supervisor_user_id' => $existingSupervisor->id,
            'onboarding_status' => 'pending_onboarding',
            'is_active' => false,
        ]);

        $notifiedUser = User::where('email', 'agent1@factory.local')->firstOrFail();

        Notification::assertSentTo(
            $notifiedUser,
            InternalUserOnboardingInviteNotification::class,
            function (InternalUserOnboardingInviteNotification $notification, array $channels) use ($notifiedUser): bool {
                $mailMessage = $notification->toMail($notifiedUser);
                $actionUrl = (string) $mailMessage->actionUrl;
                $frontendBase = rtrim((string) config('internal_onboarding.frontend_onboarding_url'), '/');

                if (! str_starts_with($actionUrl, $frontendBase . '?')) {
                    return false;
                }

                $query = parse_url($actionUrl, PHP_URL_QUERY);

                if (! is_string($query)) {
                    return false;
                }

                parse_str($query, $params);

                $invitationId = $params['invitation_id'] ?? null;
                $token = $params['token'] ?? null;

                return in_array('mail', $channels, true)
                    && $mailMessage->mailer === 'resend'
                    && $mailMessage->subject === 'You are invited to join The Factory'
                    && $mailMessage->actionText === 'Complete onboarding'
                    && is_numeric($invitationId)
                    && is_string($token)
                    && strlen($token) === 64;
            },
        );
    }

    public function test_supervisor_can_create_agent_with_public_company_id(): void
    {
        Notification::fake();

        [$company, $supervisor, $existingSupervisor] = $this->seedCompanyWithManagerAndSupervisor();

        $token = $supervisor->createToken('supervisor-token', ['*'])->plainTextToken;

        $response = $this->withToken($token)->postJson('/api/v1/internal-users', [
            'company_id' => strtolower($company->company_id),
            'full_name' => 'Public Key Agent',
            'email' => 'public-key-agent@factory.local',
            'role' => 'agent',
            'assigned_zone' => 'South Zone',
            'work_days' => ['monday', 'tuesday', 'wednesday'],
            'base_salary' => 150000,
            'currency_code' => 'NGN',
            'commission_enabled' => true,
            'supervisor_user_id' => $existingSupervisor->id,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.user.onboarding_status', 'pending_onboarding');

        $this->assertDatabaseHas('users', [
            'email' => 'public-key-agent@factory.local',
            'internal_role' => 'agent',
            'supervisor_user_id' => $existingSupervisor->id,
            'onboarding_status' => 'pending_onboarding',
            'is_active' => false,
        ]);
    }

    public function test_supervisor_can_prefill_profile_data_for_invited_user(): void
    {
        Notification::fake();

        [$company, $supervisor, $existingSupervisor] = $this->seedCompanyWithManagerAndSupervisor();

        $token = $supervisor->createToken('supervisor-token', ['*'])->plainTextToken;

        $response = $this->withToken($token)->postJson('/api/v1/internal-users', [
            'company_id' => $company->id,
            'full_name' => 'Prefilled Agent',
            'email' => 'prefilled-agent@factory.local',
            'role' => 'agent',
            'phone_number' => '+2348010000001',
            'gender' => 'female',
            'avatar_key' => 'female_02',
            'assigned_zone' => 'Central Zone',
            'work_days' => ['monday', 'tuesday', 'wednesday'],
            'base_salary' => 150000,
            'currency_code' => 'NGN',
            'supervisor_user_id' => $existingSupervisor->id,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.user.phone_number', '+2348010000001')
            ->assertJsonPath('data.user.gender', 'female')
            ->assertJsonPath('data.user.avatar_key', 'female_02');

        $this->assertDatabaseHas('users', [
            'email' => 'prefilled-agent@factory.local',
            'phone_number' => '+2348010000001',
            'gender' => 'female',
            'avatar' => 'female_02',
        ]);
    }

    public function test_supervisor_cannot_create_internal_user_with_unsupported_currency(): void
    {
        [$company, $supervisor, $existingSupervisor] = $this->seedCompanyWithManagerAndSupervisor();
        $token = $supervisor->createToken('supervisor-token', ['*'])->plainTextToken;

        $response = $this->withToken($token)->postJson('/api/v1/internal-users', [
            'company_id' => $company->id,
            'full_name' => 'Unsupported Currency Agent',
            'email' => 'unsupported-currency-agent@factory.local',
            'role' => 'agent',
            'assigned_zone' => 'South Zone',
            'work_days' => ['monday', 'tuesday', 'wednesday'],
            'base_salary' => 150000,
            'currency_code' => 'JPY',
            'supervisor_user_id' => $existingSupervisor->id,
        ]);

        $response->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['currency_code']]);
    }

    public function test_gender_prefill_auto_assigns_avatar_when_creator_omits_it(): void
    {
        Notification::fake();

        [$company, $supervisor, $existingSupervisor] = $this->seedCompanyWithManagerAndSupervisor();

        $token = $supervisor->createToken('supervisor-token', ['*'])->plainTextToken;

        $response = $this->withToken($token)->postJson('/api/v1/internal-users', [
            'company_id' => $company->id,
            'full_name' => 'Auto Avatar Agent',
            'email' => 'auto-avatar-agent@factory.local',
            'role' => 'agent',
            'gender' => 'male',
            'assigned_zone' => 'North Zone',
            'work_days' => ['monday', 'tuesday'],
            'base_salary' => 120000,
            'currency_code' => 'NGN',
            'supervisor_user_id' => $existingSupervisor->id,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.user.gender', 'male');

        $avatarKey = (string) $response->json('data.user.avatar_key');

        $this->assertNotSame('', $avatarKey);
        $this->assertTrue(str_starts_with($avatarKey, 'male_') || str_starts_with($avatarKey, 'avatar_'));

        $this->assertDatabaseHas('users', [
            'email' => 'auto-avatar-agent@factory.local',
            'gender' => 'male',
            'avatar' => $avatarKey,
        ]);
    }

    public function test_fresh_invite_link_from_notification_can_preview_onboarding(): void
    {
        Notification::fake();

        [$company, $supervisor, $existingSupervisor] = $this->seedCompanyWithManagerAndSupervisor();

        $token = $supervisor->createToken('supervisor-token', ['*'])->plainTextToken;

        $response = $this->withToken($token)->postJson('/api/v1/internal-users', [
            'company_id' => $company->id,
            'full_name' => 'Fresh Link Agent',
            'email' => 'fresh-link-agent@factory.local',
            'role' => 'agent',
            'assigned_zone' => 'South Zone',
            'work_days' => ['monday', 'tuesday'],
            'base_salary' => 100000,
            'currency_code' => 'NGN',
            'supervisor_user_id' => $existingSupervisor->id,
        ]);

        $response->assertCreated();

        $notifiedUser = User::where('email', 'fresh-link-agent@factory.local')->firstOrFail();

        $inviteLink = null;

        Notification::assertSentTo(
            $notifiedUser,
            InternalUserOnboardingInviteNotification::class,
            function (InternalUserOnboardingInviteNotification $notification) use ($notifiedUser, &$inviteLink): bool {
                $inviteLink = (string) $notification->toMail($notifiedUser)->actionUrl;

                return $inviteLink !== '';
            },
        );

        $this->assertIsString($inviteLink);

        $query = parse_url((string) $inviteLink, PHP_URL_QUERY);
        $this->assertIsString($query);

        parse_str($query, $params);

        $previewResponse = $this->postJson('/api/v1/internal/onboarding/preview', [
            'invitation_id' => (int) ($params['invitation_id'] ?? 0),
            'token' => (string) ($params['token'] ?? ''),
        ]);

        $previewResponse->assertOk()
            ->assertJson(['success' => true])
            ->assertJsonStructure(['data' => ['prefilled_data', 'avatar_options']]);
    }

    public function test_agent_creation_requires_supervisor_assignment(): void
    {
        [$company, $supervisor] = $this->seedCompanyWithManagerAndSupervisor();
        $token = $supervisor->createToken('supervisor-token', ['*'])->plainTextToken;

        $response = $this->withToken($token)->postJson('/api/v1/internal-users', [
            'company_id' => $company->id,
            'full_name' => 'Field Agent No Supervisor',
            'email' => 'agent2@factory.local',
            'role' => 'agent',
            'assigned_zone' => 'North Zone',
            'work_days' => ['monday', 'friday'],
            'base_salary' => 100000,
        ]);

        $response->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['supervisor_user_id']]);
    }

    public function test_agent_cannot_create_internal_users(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-INT-AGENT',
            'name' => 'Factory Internal',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'Field operations',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $agent = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $token = $agent->createToken('agent-token', ['*'])->plainTextToken;

        $response = $this->withToken($token)->postJson('/api/v1/internal-users', [
            'company_id' => $company->id,
            'full_name' => 'Unauthorized User',
            'email' => 'unauthorized@factory.local',
            'role' => 'supervisor',
            'assigned_zone' => 'West Zone',
            'work_days' => ['monday', 'tuesday'],
            'base_salary' => 120000,
        ]);

        $response->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['authorization']]);
    }

    public function test_invited_user_can_preview_and_complete_onboarding_once(): void
    {
        [$company, $supervisor, $existingSupervisor] = $this->seedCompanyWithManagerAndSupervisor();

        $agent = User::query()->create([
            'name' => 'Pending Agent',
            'email' => 'pending-agent@factory.local',
            'password' => 'TempPass!123',
            'onboarding_status' => 'pending_onboarding',
            'internal_role' => 'agent',
            'assigned_zone' => 'East Zone',
            'work_days' => ['monday', 'wednesday'],
            'base_salary' => 100000,
            'salary_currency' => 'NGN',
            'commission_enabled' => false,
            'supervisor_user_id' => $existingSupervisor->id,
            'invited_by_user_id' => $supervisor->id,
            'is_active' => false,
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $plainToken = str_repeat('a', 64);

        $invitation = InternalUserInvitation::query()->create([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'invited_by_user_id' => $supervisor->id,
            'role' => 'agent',
            'supervisor_user_id' => $existingSupervisor->id,
            'token_hash' => hash('sha256', $plainToken),
            'expires_at' => now()->addHours(24),
            'sent_at' => now(),
        ]);

        $previewResponse = $this->postJson('/api/v1/internal/onboarding/preview', [
            'invitation_id' => $invitation->id,
            'token' => $plainToken,
        ]);

        $previewResponse->assertOk()
            ->assertJson(['success' => true])
            ->assertJsonStructure(['data' => ['avatar_options', 'suggested_avatar_key']]);

        $avatarKey = array_key_first((array) config('internal_onboarding.avatar_catalog.male'));

        $completeResponse = $this->postJson('/api/v1/internal/onboarding/complete', [
            'invitation_id' => $invitation->id,
            'token' => $plainToken,
            'phone_number' => '+2348012345678',
            'gender' => 'male',
            'avatar_key' => $avatarKey,
            'password' => 'StrongPass!123',
            'password_confirmation' => 'StrongPass!123',
        ]);

        $completeResponse->assertOk()
            ->assertJson(['success' => true])
            ->assertJsonStructure(['data' => ['token', 'user']]);

        $this->assertDatabaseHas('users', [
            'id' => $agent->id,
            'onboarding_status' => 'active',
            'internal_role' => 'agent',
            'is_active' => true,
            'phone_number' => '+2348012345678',
            'gender' => 'male',
        ]);

        $reusedResponse = $this->postJson('/api/v1/internal/onboarding/complete', [
            'invitation_id' => $invitation->id,
            'token' => $plainToken,
            'phone_number' => '+2348099999999',
            'gender' => 'male',
            'avatar_key' => $avatarKey,
            'password' => 'StrongPass!123',
            'password_confirmation' => 'StrongPass!123',
        ]);

        $reusedResponse->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['invitation']]);
    }

    public function test_invited_user_can_complete_onboarding_with_prefilled_values_and_password_only(): void
    {
        [$company, $supervisor, $existingSupervisor] = $this->seedCompanyWithManagerAndSupervisor();

        $agent = User::query()->create([
            'name' => 'Prefilled Pending Agent',
            'email' => 'prefilled-pending-agent@factory.local',
            'password' => 'TempPass!123',
            'onboarding_status' => 'pending_onboarding',
            'internal_role' => 'agent',
            'assigned_zone' => 'East Zone',
            'work_days' => ['monday', 'wednesday'],
            'base_salary' => 100000,
            'salary_currency' => 'NGN',
            'commission_enabled' => false,
            'supervisor_user_id' => $existingSupervisor->id,
            'invited_by_user_id' => $supervisor->id,
            'phone_number' => '+2348012341111',
            'gender' => 'female',
            'avatar' => 'female_03',
            'is_active' => false,
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $plainToken = str_repeat('b', 64);

        $invitation = InternalUserInvitation::query()->create([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'invited_by_user_id' => $supervisor->id,
            'role' => 'agent',
            'supervisor_user_id' => $existingSupervisor->id,
            'token_hash' => hash('sha256', $plainToken),
            'expires_at' => now()->addHours(24),
            'sent_at' => now(),
        ]);

        $previewResponse = $this->postJson('/api/v1/internal/onboarding/preview', [
            'invitation_id' => $invitation->id,
            'token' => $plainToken,
        ]);

        $previewResponse->assertOk()
            ->assertJsonPath('data.prefilled_data.phone_number', '+2348012341111')
            ->assertJsonPath('data.prefilled_data.gender', 'female')
            ->assertJsonPath('data.prefilled_data.avatar_key', 'female_03')
            ->assertJsonPath('data.selected_avatar_key', 'female_03');

        $completeResponse = $this->postJson('/api/v1/internal/onboarding/complete', [
            'invitation_id' => $invitation->id,
            'token' => $plainToken,
            'password' => 'StrongPass!123',
            'password_confirmation' => 'StrongPass!123',
        ]);

        $completeResponse->assertOk()
            ->assertJsonPath('data.user.phone_number', '+2348012341111')
            ->assertJsonPath('data.user.gender', 'female')
            ->assertJsonPath('data.user.avatar_key', 'female_03');

        $this->assertDatabaseHas('users', [
            'id' => $agent->id,
            'phone_number' => '+2348012341111',
            'gender' => 'female',
            'avatar' => 'female_03',
            'onboarding_status' => 'active',
            'is_active' => true,
        ]);
    }

    public function test_onboarding_completion_can_override_prefilled_values(): void
    {
        [$company, $supervisor, $existingSupervisor] = $this->seedCompanyWithManagerAndSupervisor();

        $agent = User::query()->create([
            'name' => 'Override Pending Agent',
            'email' => 'override-agent@factory.local',
            'password' => 'TempPass!123',
            'onboarding_status' => 'pending_onboarding',
            'internal_role' => 'agent',
            'assigned_zone' => 'East Zone',
            'work_days' => ['monday', 'wednesday'],
            'base_salary' => 100000,
            'salary_currency' => 'NGN',
            'commission_enabled' => false,
            'supervisor_user_id' => $existingSupervisor->id,
            'invited_by_user_id' => $supervisor->id,
            'phone_number' => '+2348012342222',
            'gender' => 'female',
            'avatar' => 'female_01',
            'is_active' => false,
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $plainToken = str_repeat('c', 64);

        $invitation = InternalUserInvitation::query()->create([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'invited_by_user_id' => $supervisor->id,
            'role' => 'agent',
            'supervisor_user_id' => $existingSupervisor->id,
            'token_hash' => hash('sha256', $plainToken),
            'expires_at' => now()->addHours(24),
            'sent_at' => now(),
        ]);

        $completeResponse = $this->postJson('/api/v1/internal/onboarding/complete', [
            'invitation_id' => $invitation->id,
            'token' => $plainToken,
            'phone_number' => '+2348012343333',
            'gender' => 'male',
            'avatar_key' => 'male_02',
            'password' => 'StrongPass!123',
            'password_confirmation' => 'StrongPass!123',
        ]);

        $completeResponse->assertOk()
            ->assertJsonPath('data.user.phone_number', '+2348012343333')
            ->assertJsonPath('data.user.gender', 'male')
            ->assertJsonPath('data.user.avatar_key', 'male_02');

        $this->assertDatabaseHas('users', [
            'id' => $agent->id,
            'phone_number' => '+2348012343333',
            'gender' => 'male',
            'avatar' => 'male_02',
        ]);
    }

    public function test_internal_onboarding_completion_restores_missing_company_membership(): void
    {
        [$company, $supervisor, $existingSupervisor] = $this->seedCompanyWithManagerAndSupervisor();

        $agent = User::query()->create([
            'name' => 'Membership Restore Agent',
            'email' => 'membership-restore@factory.local',
            'password' => 'TempPass!123',
            'onboarding_status' => 'pending_onboarding',
            'internal_role' => 'agent',
            'assigned_zone' => 'East Zone',
            'work_days' => ['monday', 'wednesday'],
            'base_salary' => 100000,
            'salary_currency' => 'NGN',
            'commission_enabled' => false,
            'supervisor_user_id' => $existingSupervisor->id,
            'invited_by_user_id' => $supervisor->id,
            'is_active' => false,
        ]);

        $plainToken = str_repeat('z', 64);

        $invitation = InternalUserInvitation::query()->create([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'invited_by_user_id' => $supervisor->id,
            'role' => 'agent',
            'supervisor_user_id' => $existingSupervisor->id,
            'token_hash' => hash('sha256', $plainToken),
            'expires_at' => now()->addHours(24),
            'sent_at' => now(),
        ]);

        $avatarKey = array_key_first((array) config('internal_onboarding.avatar_catalog.male'));

        $this->postJson('/api/v1/internal/onboarding/complete', [
            'invitation_id' => $invitation->id,
            'token' => $plainToken,
            'phone_number' => '+2348011111111',
            'gender' => 'male',
            'avatar_key' => $avatarKey,
            'password' => 'StrongPass!123',
            'password_confirmation' => 'StrongPass!123',
        ])->assertOk();

        $this->assertDatabaseHas('company_users', [
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'role' => 'agent',
        ]);
    }

    public function test_supervisor_login_requires_active_onboarded_user_on_shared_auth_endpoint(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-SUP-LOGIN',
            'name' => 'Supervisor Login Co',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'Operations',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $user = User::factory()->create([
            'email' => 'supervisor-login@factory.local',
            'password' => 'StrongPass!123',
            'internal_role' => 'supervisor',
            'onboarding_status' => 'active',
            'is_active' => true,
            'internal_onboarding_completed_at' => now(),
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'role' => 'supervisor',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $okResponse = $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'StrongPass!123',
        ]);

        $okResponse->assertOk()
            ->assertJson(['success' => true])
            ->assertJsonPath('data.user_type', 'supervisor')
            ->assertJsonPath('data.access_role', 'supervisor')
            ->assertJsonStructure(['data' => ['token', 'user']]);

        $user->update(['is_active' => false]);

        $failResponse = $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'StrongPass!123',
        ]);

        $failResponse->assertUnauthorized();
    }

    private function seedCompanyWithManagerAndSupervisor(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-INT-001',
            'name' => 'Factory Internal',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'Internal operations',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $manager = User::factory()->create(['email_verified_at' => now()]);
        $supervisor = User::factory()->create(['email_verified_at' => now(), 'internal_role' => 'supervisor']);

        DB::table('company_users')->insert([
            [
                'company_id' => $company->id,
                'user_id' => $manager->id,
                'role' => 'supervisor',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'company_id' => $company->id,
                'user_id' => $supervisor->id,
                'role' => 'supervisor',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        return [$company, $manager, $supervisor];
    }

    public function test_expired_invitation_cannot_be_used(): void
    {
        [$company, $supervisor, $existingSupervisor] = $this->seedCompanyWithManagerAndSupervisor();

        $agent = User::query()->create([
            'name' => 'Expired Agent',
            'email' => 'expired-agent@factory.local',
            'password' => 'TempPass!123',
            'onboarding_status' => 'pending_onboarding',
            'internal_role' => 'agent',
            'is_active' => false,
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $plainToken = str_repeat('d', 64);

        $invitation = InternalUserInvitation::query()->create([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'invited_by_user_id' => $supervisor->id,
            'role' => 'agent',
            'supervisor_user_id' => $existingSupervisor->id,
            'token_hash' => hash('sha256', $plainToken),
            'expires_at' => now()->subMinutes(1),
            'sent_at' => now(),
        ]);

        $response = $this->postJson('/api/v1/internal/onboarding/preview', [
            'invitation_id' => $invitation->id,
            'token' => $plainToken,
        ]);

        $response->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['invitation']]);
    }

    public function test_revoked_invitation_cannot_be_used(): void
    {
        [$company, $supervisor, $existingSupervisor] = $this->seedCompanyWithManagerAndSupervisor();

        $agent = User::query()->create([
            'name' => 'Revoked Agent',
            'email' => 'revoked-agent@factory.local',
            'password' => 'TempPass!123',
            'onboarding_status' => 'pending_onboarding',
            'internal_role' => 'agent',
            'is_active' => false,
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $plainToken = str_repeat('e', 64);

        $invitation = InternalUserInvitation::query()->create([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'invited_by_user_id' => $supervisor->id,
            'role' => 'agent',
            'supervisor_user_id' => $existingSupervisor->id,
            'token_hash' => hash('sha256', $plainToken),
            'expires_at' => now()->addHours(24),
            'revoked_at' => now(),
            'sent_at' => now(),
        ]);

        $response = $this->postJson('/api/v1/internal/onboarding/preview', [
            'invitation_id' => $invitation->id,
            'token' => $plainToken,
        ]);

        $response->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['invitation']]);
    }

    public function test_invalid_token_rejected(): void
    {
        [$company, $supervisor, $existingSupervisor] = $this->seedCompanyWithManagerAndSupervisor();

        $agent = User::query()->create([
            'name' => 'Invalid Token Agent',
            'email' => 'invalid-token-agent@factory.local',
            'password' => 'TempPass!123',
            'onboarding_status' => 'pending_onboarding',
            'internal_role' => 'agent',
            'is_active' => false,
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $plainToken = str_repeat('f', 64);
        $wrongToken = str_repeat('g', 64);

        $invitation = InternalUserInvitation::query()->create([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'invited_by_user_id' => $supervisor->id,
            'role' => 'agent',
            'supervisor_user_id' => $existingSupervisor->id,
            'token_hash' => hash('sha256', $plainToken),
            'expires_at' => now()->addHours(24),
            'sent_at' => now(),
        ]);

        $response = $this->postJson('/api/v1/internal/onboarding/preview', [
            'invitation_id' => $invitation->id,
            'token' => $wrongToken,
        ]);

        $response->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['token']]);
    }

    public function test_avatar_gender_mismatch_rejected(): void
    {
        [$company, $supervisor, $existingSupervisor] = $this->seedCompanyWithManagerAndSupervisor();

        $agent = User::query()->create([
            'name' => 'Gender Mismatch Agent',
            'email' => 'gender-mismatch-agent@factory.local',
            'password' => 'TempPass!123',
            'onboarding_status' => 'pending_onboarding',
            'internal_role' => 'agent',
            'is_active' => false,
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $plainToken = str_repeat('h', 64);

        $invitation = InternalUserInvitation::query()->create([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'invited_by_user_id' => $supervisor->id,
            'role' => 'agent',
            'supervisor_user_id' => $existingSupervisor->id,
            'token_hash' => hash('sha256', $plainToken),
            'expires_at' => now()->addHours(24),
            'sent_at' => now(),
        ]);

        $response = $this->postJson('/api/v1/internal/onboarding/complete', [
            'invitation_id' => $invitation->id,
            'token' => $plainToken,
            'phone_number' => '+2348012345678',
            'gender' => 'male',
            'avatar_key' => 'female_01',
            'password' => 'StrongPass!123',
            'password_confirmation' => 'StrongPass!123',
        ]);

        $response->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['avatar_key']]);
    }

    public function test_resend_invite_invalidates_old_token(): void
    {
        Notification::fake();
        [$company, $supervisor, $existingSupervisor] = $this->seedCompanyWithManagerAndSupervisor();

        $token = $supervisor->createToken('supervisor-token', ['*'])->plainTextToken;

        $response = $this->withToken($token)->postJson('/api/v1/internal-users', [
            'company_id' => $company->id,
            'full_name' => 'Resend Token Agent',
            'email' => 'resend-token-agent@factory.local',
            'role' => 'agent',
            'assigned_zone' => 'South Zone',
            'work_days' => ['monday', 'tuesday', 'wednesday'],
            'base_salary' => 150000,
            'currency_code' => 'NGN',
            'commission_enabled' => true,
            'supervisor_user_id' => $existingSupervisor->id,
        ]);

        $response->assertStatus(201);
        $userId = (int) $response->json('data.user.id');

        $firstInvitation = InternalUserInvitation::query()
            ->where('user_id', $userId)
            ->orderBy('created_at', 'asc')
            ->first();

        $this->assertNotNull($firstInvitation);
        $this->assertNull($firstInvitation->revoked_at);

        $resendResponse = $this->withToken($token)->postJson(
            "/api/v1/internal-users/{$userId}/invite"
        );

        $resendResponse->assertOk();

        $this->assertTrue(
            InternalUserInvitation::query()
                ->where('id', $firstInvitation->id)
                ->whereNotNull('revoked_at')
                ->exists()
        );
    }

    public function test_signed_onboarding_link_tampering_is_rejected(): void
    {
        $signedUrl = URL::temporarySignedRoute(
            'internal.onboarding.invite',
            now()->addMinutes(5),
            ['invitation' => 123, 'token' => str_repeat('a', 64)],
        );

        $tamperedUrl = $signedUrl . '&token=' . str_repeat('b', 64);

        $this->get($tamperedUrl)->assertForbidden();
    }
}
