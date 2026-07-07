<?php

declare(strict_types=1);

namespace Tests\Feature\Profile;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProfileManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_management_user_can_fetch_profile_with_full_context(): void
    {
        $user = User::factory()->create([
            'name' => 'Owner Profile User',
            'email' => 'owner.profile@example.test',
            'internal_role' => null,
            'onboarding_completed_at' => now(),
            'phone_number' => '+2348012345678',
            'gender' => 'female',
            'is_active' => true,
        ]);

        $company = $this->createCompany('FAC-PROFILE-MGMT', 'Management Profile Co');
        $this->attachMembership($company, $user, 'owner');

        $response = $this->withToken($user->createToken('profile')->plainTextToken)
            ->getJson('/api/v1/user/profile?company_id=' . strtolower($company->company_id));

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.identity.full_name', 'Owner Profile User')
            ->assertJsonPath('data.organization.company.company_id', 'FAC-PROFILE-MGMT')
            ->assertJsonPath('data.organization.role', 'owner')
            ->assertJsonPath('data.permissions.can_edit_country', true)
            ->assertJsonPath('data.account.email_verified', true);
    }

    public function test_agent_user_can_fetch_profile_and_country_remains_read_only(): void
    {
        $agent = User::factory()->create([
            'name' => 'Agent Profile User',
            'email' => 'agent.profile@example.test',
            'internal_role' => 'agent',
            'onboarding_status' => 'active',
            'internal_onboarding_completed_at' => now(),
            'phone_number' => '+2348099999999',
            'gender' => 'male',
            'is_active' => true,
        ]);

        $company = $this->createCompany('FAC-PROFILE-AGENT', 'Agent Profile Co');
        $this->attachMembership($company, $agent, 'agent');

        $response = $this->withToken($agent->createToken('profile')->plainTextToken)
            ->getJson('/api/v1/user/profile?company_id=' . $company->id);

        $response->assertOk()
            ->assertJsonPath('data.organization.role', 'agent')
            ->assertJsonPath('data.organization.internal_role', 'agent')
            ->assertJsonPath('data.permissions.can_edit_country', false)
            ->assertJsonPath('data.organization.assigned_company.company_id', 'FAC-PROFILE-AGENT');
    }

    public function test_profile_endpoint_handles_double_slash_path_variant(): void
    {
        $user = User::factory()->create([
            'name' => 'Double Slash User',
            'email' => 'double.slash.profile@example.test',
            'onboarding_completed_at' => now(),
            'is_active' => true,
        ]);

        $company = $this->createCompany('FAC-PROFILE-DSLASH', 'Double Slash Co');
        $this->attachMembership($company, $user, 'owner');

        $response = $this->withToken($user->createToken('profile')->plainTextToken)
            ->getJson('/api/v1//user/profile?company_id=' . $company->company_id);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.organization.company.company_id', 'FAC-PROFILE-DSLASH');
    }

    public function test_user_can_update_profile_identity_fields(): void
    {
        $user = User::factory()->create([
            'name' => 'Old Name',
            'phone_number' => '+2348000000001',
            'gender' => 'male',
            'onboarding_completed_at' => now(),
        ]);

        $company = $this->createCompany('FAC-PROFILE-UPD', 'Update Profile Co');
        $this->attachMembership($company, $user, 'admin');

        $response = $this->withToken($user->createToken('profile')->plainTextToken)
            ->patchJson('/api/v1/user/profile', [
                'company_id' => $company->company_id,
                'name' => 'New Name',
                'phone_number' => '+2348111111111',
                'gender' => 'female',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.identity.full_name', 'New Name')
            ->assertJsonPath('data.identity.phone_number', '+2348111111111')
            ->assertJsonPath('data.identity.gender', 'female');

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'name' => 'New Name',
            'phone_number' => '+2348111111111',
            'gender' => 'female',
        ]);
    }

    public function test_owner_can_update_company_country_from_profile(): void
    {
        $owner = User::factory()->create([
            'onboarding_completed_at' => now(),
        ]);

        $company = $this->createCompany('FAC-PROFILE-COUNTRY', 'Country Edit Co', 'NG');
        $this->attachMembership($company, $owner, 'owner');

        $response = $this->withToken($owner->createToken('profile')->plainTextToken)
            ->patchJson('/api/v1/user/profile', [
                'company_id' => $company->company_id,
                'country' => 'us',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.organization.company.country', 'US');

        $this->assertDatabaseHas('companies', [
            'id' => $company->id,
            'country' => 'US',
        ]);
    }

    public function test_agent_cannot_update_company_country_from_profile(): void
    {
        $agent = User::factory()->create([
            'internal_role' => 'agent',
            'onboarding_status' => 'active',
            'internal_onboarding_completed_at' => now(),
        ]);

        $company = $this->createCompany('FAC-PROFILE-NO-COUNTRY', 'No Country Edit Co', 'NG');
        $this->attachMembership($company, $agent, 'agent');

        $response = $this->withToken($agent->createToken('profile')->plainTextToken)
            ->patchJson('/api/v1/user/profile', [
                'company_id' => $company->company_id,
                'country' => 'US',
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath('errors.country.0', 'You are not allowed to update company country.');

        $this->assertDatabaseHas('companies', [
            'id' => $company->id,
            'country' => 'NG',
        ]);
    }

    public function test_immutable_profile_fields_are_rejected(): void
    {
        $user = User::factory()->create([
            'onboarding_completed_at' => now(),
        ]);

        $company = $this->createCompany('FAC-PROFILE-IMMUTABLE', 'Immutable Fields Co');
        $this->attachMembership($company, $user, 'admin');

        $response = $this->withToken($user->createToken('profile')->plainTextToken)
            ->patchJson('/api/v1/user/profile', [
                'company_id' => $company->company_id,
                'email' => 'new@example.test',
                'role' => 'owner',
                'internal_role' => 'agent',
            ]);

        $response->assertUnprocessable()
            ->assertJsonStructure([
                'errors' => ['email', 'role', 'internal_role'],
            ]);
    }

    public function test_user_can_select_existing_catalog_avatar(): void
    {
        Storage::fake('avatars');

        config([
            'filesystems.avatar_disk' => 'avatars',
            'filesystems.disks.avatars.url' => 'https://factory23-storage.lon1.digitaloceanspaces.com',
            'internal_onboarding.avatar_storage_root' => 'avatar',
        ]);

        Storage::disk('avatars')->put('avatar/male/avatar_1.png', 'fake');

        $user = User::factory()->create([
            'gender' => 'male',
            'onboarding_completed_at' => now(),
            'avatar' => null,
        ]);

        $company = $this->createCompany('FAC-PROFILE-AVATAR-KEY', 'Avatar Key Co');
        $this->attachMembership($company, $user, 'admin');

        $response = $this->withToken($user->createToken('profile')->plainTextToken)
            ->postJson('/api/v1/user/profile/avatar', [
                'company_id' => $company->company_id,
                'avatar_key' => 'avatar_1',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.identity.avatar_key', 'avatar_1')
            ->assertJsonPath('data.identity.avatar_source', 'catalog');

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'avatar' => 'avatar_1',
        ]);
    }

    public function test_custom_avatar_upload_replaces_previous_custom_image_and_cleans_old_file(): void
    {
        Storage::fake('avatars');

        config([
            'filesystems.avatar_disk' => 'avatars',
            'filesystems.disks.avatars.url' => 'https://factory23-storage.lon1.digitaloceanspaces.com',
            'internal_onboarding.avatar_storage_root' => 'avatar',
        ]);

        $oldPath = 'avatar/custom/user_old.png';
        Storage::disk('avatars')->put($oldPath, 'old-avatar');

        $user = User::factory()->create([
            'avatar' => $oldPath,
            'gender' => 'female',
            'onboarding_completed_at' => now(),
        ]);

        $company = $this->createCompany('FAC-PROFILE-AVATAR-UP', 'Avatar Upload Co');
        $this->attachMembership($company, $user, 'owner');

        $file = UploadedFile::fake()->image('new-avatar.png', 200, 200);

        $response = $this
            ->withToken($user->createToken('profile')->plainTextToken)
            ->post('/api/v1/user/profile/avatar', [
                'company_id' => $company->company_id,
                'avatar_file' => $file,
            ], ['Accept' => 'application/json']);

        $response->assertOk();

        $newAvatarPath = (string) $response->json('data.identity.avatar_key');

        $this->assertNotSame($oldPath, $newAvatarPath);
        $this->assertStringStartsWith('avatar/custom/', $newAvatarPath);
        $this->assertTrue(Storage::disk('avatars')->exists($newAvatarPath));
        $this->assertFalse(Storage::disk('avatars')->exists($oldPath));
    }

    public function test_profile_endpoints_reject_invalid_company_context_for_user(): void
    {
        $user = User::factory()->create([
            'onboarding_completed_at' => now(),
        ]);

        $companyA = $this->createCompany('FAC-PROFILE-ISO-A', 'Isolation Company A');
        $companyB = $this->createCompany('FAC-PROFILE-ISO-B', 'Isolation Company B');

        $this->attachMembership($companyA, $user, 'owner');

        $response = $this->withToken($user->createToken('profile')->plainTextToken)
            ->getJson('/api/v1/user/profile?company_id=' . $companyB->company_id);

        $response->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['company_id']]);
    }

    private function createCompany(string $companyId, string $name, string $country = 'NG'): Company
    {
        return Company::create([
            'company_id' => $companyId,
            'name' => $name,
            'country' => $country,
            'team_size' => '11-50',
            'use_case' => 'Profile management testing',
            'status' => 'active',
            'activated_at' => now(),
        ]);
    }

    private function attachMembership(Company $company, User $user, string $role): void
    {
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'role' => $role,
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
