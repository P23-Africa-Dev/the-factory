<?php

declare(strict_types=1);

namespace Tests\Feature\Project;

use App\Models\Company;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ProjectUpdateTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_update_project(): void
    {
        [$company, $admin] = $this->seedCompanyAdmin();

        $project = Project::create([
            'company_id' => $company->id,
            'project_manager_user_id' => $admin->id,
            'created_by_user_id' => $admin->id,
            'name' => 'Original Name',
            'description' => 'Original description.',
            'status' => 'planning',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addDays(30)->toDateString(),
            'duration_days' => 30,
        ]);

        $response = $this->withToken($admin->createToken('t', ['*'])->plainTextToken)
            ->patchJson('/api/v1/projects/'.$project->id, [
                'company_id' => $company->id,
                'name' => 'Updated Name',
            ]);

        $response->assertOk()
            ->assertJson(['success' => true])
            ->assertJsonPath('data.project.name', 'Updated Name');
    }

    public function test_project_update_rejects_end_date_before_start_date(): void
    {
        [$company, $admin] = $this->seedCompanyAdmin();

        $project = Project::create([
            'company_id' => $company->id,
            'project_manager_user_id' => $admin->id,
            'created_by_user_id' => $admin->id,
            'name' => 'Date Test Project',
            'status' => 'planning',
            'start_date' => '2025-06-01',
            'end_date' => '2025-06-30',
            'duration_days' => 29,
        ]);

        $response = $this->withToken($admin->createToken('t', ['*'])->plainTextToken)
            ->patchJson('/api/v1/projects/'.$project->id, [
                'company_id' => $company->id,
                'start_date' => '2025-06-15',
                'end_date' => '2025-06-10',
            ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['end_date']);
    }

    public function test_agent_cannot_update_project(): void
    {
        [$company, $admin] = $this->seedCompanyAdmin();

        $agent = User::factory()->create(['email_verified_at' => now()]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $project = Project::create([
            'company_id' => $company->id,
            'project_manager_user_id' => $admin->id,
            'created_by_user_id' => $admin->id,
            'name' => 'Agent Attempt',
            'status' => 'planning',
            'start_date' => now()->toDateString(),
            'duration_days' => 10,
        ]);

        $response = $this->withToken($agent->createToken('t', ['*'])->plainTextToken)
            ->patchJson('/api/v1/projects/'.$project->id, [
                'company_id' => $company->id,
                'name' => 'Hacked Name',
            ]);

        $response->assertUnprocessable()
            ->assertJson(['success' => false]);
    }

    private function seedCompanyAdmin(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-UPD001',
            'name' => 'Update Test Co',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Testing project updates',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $admin = User::factory()->create(['email_verified_at' => now()]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $admin->id,
            'role' => 'admin',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [$company, $admin];
    }
}
