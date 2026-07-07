<?php

declare(strict_types=1);

namespace Tests\Feature\Demo;

use App\Enums\SubscriptionStatus;
use App\Jobs\SimulateDemoAgentMovementJob;
use App\Models\Company;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

final class DemoTrackingSimulationTest extends TestCase
{
    use RefreshDatabase;

    public function test_demo_task_start_dispatches_movement_simulation_job(): void
    {
        Queue::fake();

        [$company, $admin, $agent] = $this->seedDemoCompanyUsers();

        $task = $this->createAssignedTask($company->id, $admin->id, $agent->id, [
            'status' => 'pending',
            'latitude' => 6.4300,
            'longitude' => 3.4200,
        ]);

        $token = $agent->createToken('agent-token', ['*'])->plainTextToken;

        $response = $this->withToken($token)
            ->postJson('/api/v1/tasks/' . $task->id . '/start', [
                'company_id' => $company->id,
                'location_permission_granted' => true,
                'latitude' => 6.4100,
                'longitude' => 3.4000,
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.demo_simulation_active', true);

        Queue::assertPushed(SimulateDemoAgentMovementJob::class);
    }

    public function test_non_demo_task_start_does_not_dispatch_simulation_job(): void
    {
        Queue::fake();

        [$company, $admin, $agent] = $this->seedRegularCompanyUsers();

        $task = $this->createAssignedTask($company->id, $admin->id, $agent->id, [
            'status' => 'pending',
            'latitude' => 6.4300,
            'longitude' => 3.4200,
        ]);

        $token = $agent->createToken('agent-token', ['*'])->plainTextToken;

        $response = $this->withToken($token)
            ->postJson('/api/v1/tasks/' . $task->id . '/start', [
                'company_id' => $company->id,
                'location_permission_granted' => true,
                'latitude' => 6.4100,
                'longitude' => 3.4000,
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.demo_simulation_active', false);

        Queue::assertNotPushed(SimulateDemoAgentMovementJob::class);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createAssignedTask(int $companyId, int $creatorId, int $agentId, array $overrides = []): Task
    {
        $task = Task::query()->create(array_merge([
            'company_id' => $companyId,
            'created_by_user_id' => $creatorId,
            'assigned_agent_id' => $agentId,
            'last_status_updated_by_user_id' => $creatorId,
            'title' => 'Tracked visit',
            'type' => 'sales_visit',
            'location' => 'Lagos',
            'latitude' => 6.4500,
            'longitude' => 3.3500,
            'due_at' => now()->addDay(),
            'required_actions' => [],
            'priority' => 'medium',
            'minimum_photos_required' => 0,
            'visit_verification_required' => false,
            'status' => 'pending',
        ], $overrides));

        DB::table('task_assignments')->insert([
            'task_id' => $task->id,
            'assigned_by_user_id' => $creatorId,
            'assigned_agent_id' => $agentId,
            'assigned_at' => now(),
            'is_current' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $task;
    }

    /**
     * @return array{0: Company, 1: User, 2: User}
     */
    private function seedDemoCompanyUsers(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-DEMO' . strtoupper(Str::random(4)),
            'name' => 'Demo Tracking Ltd',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'demo',
            'status' => 'active',
            'activated_at' => now(),
            'is_demo' => true,
            'subscription_status' => SubscriptionStatus::GRACE->value,
            'subscription_grace_ends_at' => '2038-01-01 00:00:00',
        ]);

        return $this->attachAdminAndAgent($company);
    }

    /**
     * @return array{0: Company, 1: User, 2: User}
     */
    private function seedRegularCompanyUsers(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-TRACK' . strtoupper(Str::random(4)),
            'name' => 'Regular Tracking Ltd',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'tracking',
            'status' => 'active',
            'activated_at' => now(),
            'is_demo' => false,
            'subscription_status' => SubscriptionStatus::ACTIVE->value,
        ]);

        return $this->attachAdminAndAgent($company);
    }

    /**
     * @return array{0: Company, 1: User, 2: User}
     */
    private function attachAdminAndAgent(Company $company): array
    {
        $admin = User::factory()->create(['email_verified_at' => now()]);
        $agent = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            [
                'company_id' => $company->id,
                'user_id' => $admin->id,
                'role' => 'admin',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'company_id' => $company->id,
                'user_id' => $agent->id,
                'role' => 'agent',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        return [$company, $admin, $agent];
    }
}
