<?php

declare(strict_types=1);

namespace Tests\Feature\Avatar;

use App\Models\Company;
use App\Models\User;
use Database\Seeders\DemoCompanySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AssignDemoAvatarsCommandTest extends TestCase
{
    use RefreshDatabase;

    private function configureAvatarsDisk(): void
    {
        Storage::fake('avatars');

        config([
            'filesystems.avatar_disk' => 'avatars',
            'filesystems.disks.avatars.url' => 'https://factory23-storage.lon1.digitaloceanspaces.com',
            'internal_onboarding.avatar_storage_root' => 'avatar',
            'internal_onboarding.avatar_catalog' => [],
        ]);

        Storage::disk('avatars')->put('avatar/male/male_01.png', 'png');
        Storage::disk('avatars')->put('avatar/male/male_02.png', 'png');
        Storage::disk('avatars')->put('avatar/female/female_01.png', 'png');
        Storage::disk('avatars')->put('avatar/female/female_02.png', 'png');
    }

    public function test_command_assigns_gender_matched_avatar_to_demo_users(): void
    {
        $this->configureAvatarsDisk();

        $company = Company::create([
            'company_id' => DemoCompanySeeder::COMPANY_PUBLIC_ID,
            'name' => 'Demo Co',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'Avatar assignment test',
            'status' => 'active',
            'activated_at' => now(),
            'is_demo' => true,
        ]);

        $maleUser = User::factory()->create([
            'email' => 'demo-male@thefactory23.com',
            'gender' => 'male',
            'avatar' => null,
        ]);

        $femaleUser = User::factory()->create([
            'email' => 'demo-female@thefactory23.com',
            'gender' => 'female',
            'avatar' => null,
        ]);

        foreach ([$maleUser, $femaleUser] as $user) {
            DB::table('company_users')->insert([
                'company_id' => $company->id,
                'user_id' => $user->id,
                'role' => 'agent',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $this->artisan('avatars:assign-demo')
            ->assertSuccessful();

        $maleUser->refresh();
        $femaleUser->refresh();

        $this->assertContains($maleUser->avatar, ['male_01', 'male_02']);
        $this->assertContains($femaleUser->avatar, ['female_01', 'female_02']);
    }

    public function test_dry_run_does_not_persist_avatar_assignments(): void
    {
        $this->configureAvatarsDisk();

        $company = Company::create([
            'company_id' => DemoCompanySeeder::COMPANY_PUBLIC_ID,
            'name' => 'Demo Co',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'Avatar assignment test',
            'status' => 'active',
            'activated_at' => now(),
            'is_demo' => true,
        ]);

        $user = User::factory()->create([
            'email' => 'demo-dry-run@thefactory23.com',
            'gender' => 'male',
            'avatar' => null,
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->artisan('avatars:assign-demo', ['--dry-run' => true])
            ->assertSuccessful();

        $this->assertNull($user->fresh()->avatar);
    }

    public function test_command_skips_users_with_existing_avatar_by_default(): void
    {
        $this->configureAvatarsDisk();

        $company = Company::create([
            'company_id' => DemoCompanySeeder::COMPANY_PUBLIC_ID,
            'name' => 'Demo Co',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'Avatar assignment test',
            'status' => 'active',
            'activated_at' => now(),
            'is_demo' => true,
        ]);

        $user = User::factory()->create([
            'email' => 'demo-existing@thefactory23.com',
            'gender' => 'male',
            'avatar' => 'male_01',
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->artisan('avatars:assign-demo')
            ->assertSuccessful();

        $this->assertSame('male_01', $user->fresh()->avatar);
    }
}
