<?php

declare(strict_types=1);

namespace Tests\Feature\Territory;

use App\Models\Company;
use App\Models\Task;
use App\Models\TaskLocationPoint;
use App\Models\TaskTrackingSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AgentTerritoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_management_can_list_territories_with_stable_colors(): void
    {
        [$company, $admin, $agent] = $this->seedCompany('FAC-TER001', 'Territory Ltd');

        $first = $this->withToken($admin->createToken('t1', ['*'])->plainTextToken)
            ->getJson('/api/v1/admin/territories?company_id='.$company->id);

        $first->assertOk()
            ->assertJsonPath('data.items.0.user_id', $agent->id)
            ->assertJsonPath('data.items.0.mode', 'auto')
            ->assertJsonPath('data.items.0.is_visible', true);

        $color = (string) $first->json('data.items.0.color');
        $this->assertMatchesRegularExpression('/^#[0-9A-Fa-f]{6}$/', $color);

        $second = $this->withToken($admin->createToken('t2', ['*'])->plainTextToken)
            ->getJson('/api/v1/admin/territories?company_id='.$company->id);

        $second->assertOk()->assertJsonPath('data.items.0.color', $color);
        $this->assertCount(1, $second->json('data.items'));
    }

    public function test_coverage_points_include_task_destinations_and_trail_points(): void
    {
        [$company, $admin, $agent] = $this->seedCompany('FAC-TER002', 'Coverage Ltd');

        $task = Task::query()->create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Visit client site',
            'status' => 'pending',
            'priority' => 'medium',
            'latitude' => 51.5265,
            'longitude' => -0.0782,
        ]);

        $session = TaskTrackingSession::query()->create([
            'task_id' => $task->id,
            'company_id' => $company->id,
            'started_by_user_id' => $agent->id,
            'start_latitude' => 51.52,
            'start_longitude' => -0.09,
            'start_recorded_at' => now()->subDay(),
        ]);

        foreach (range(0, 4) as $i) {
            TaskLocationPoint::query()->create([
                'tracking_session_id' => $session->id,
                'task_id' => $task->id,
                'company_id' => $company->id,
                'user_id' => $agent->id,
                'latitude' => 51.52 + $i * 0.001,
                'longitude' => -0.09 + $i * 0.001,
                'event_type' => 'movement',
                'recorded_at' => now()->subDay()->addMinutes($i * 5),
            ]);
        }

        $response = $this->withToken($admin->createToken('cov', ['*'])->plainTextToken)
            ->getJson('/api/v1/admin/territories/coverage-points?company_id='.$company->id);

        $response->assertOk();

        $items = collect($response->json('data.items'));
        $agentItem = $items->firstWhere('user_id', $agent->id);

        $this->assertNotNull($agentItem);
        $this->assertCount(1, $agentItem['task_points']);
        $this->assertSame(2, $agentItem['task_points'][0]['weight']);
        $this->assertCount(5, $agentItem['trail_points']);
    }

    public function test_admin_can_save_manual_territory_and_reset_to_auto(): void
    {
        [$company, $admin, $agent] = $this->seedCompany('FAC-TER003', 'Manual Zones Ltd');

        $polygon = [
            'type' => 'Polygon',
            'coordinates' => [[
                [-0.10, 51.50],
                [-0.05, 51.50],
                [-0.05, 51.54],
                [-0.10, 51.54],
                [-0.10, 51.50],
            ]],
        ];

        $save = $this->withToken($admin->createToken('save', ['*'])->plainTextToken)
            ->putJson('/api/v1/admin/territories/'.$agent->id, [
                'company_id' => $company->id,
                'geojson' => $polygon,
                'name' => 'East Zone',
                'color' => '#12A594',
            ]);

        $save->assertOk()
            ->assertJsonPath('data.territory.mode', 'manual')
            ->assertJsonPath('data.territory.name', 'East Zone')
            ->assertJsonPath('data.territory.color', '#12A594')
            ->assertJsonPath('data.territory.geojson.type', 'Polygon');

        $reset = $this->withToken($admin->createToken('reset', ['*'])->plainTextToken)
            ->deleteJson('/api/v1/admin/territories/'.$agent->id, [
                'company_id' => $company->id,
            ]);

        $reset->assertOk()->assertJsonPath('data.reset_user_id', $agent->id);

        $this->assertDatabaseHas('agent_territories', [
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'mode' => 'auto',
            'geojson' => null,
        ]);
    }

    public function test_manual_polygon_is_validated(): void
    {
        [$company, $admin, $agent] = $this->seedCompany('FAC-TER004', 'Validation Ltd');

        $unclosed = [
            'type' => 'Polygon',
            'coordinates' => [[
                [-0.10, 51.50],
                [-0.05, 51.50],
                [-0.05, 51.54],
                [-0.10, 51.54],
            ]],
        ];

        $this->withToken($admin->createToken('bad', ['*'])->plainTextToken)
            ->putJson('/api/v1/admin/territories/'.$agent->id, [
                'company_id' => $company->id,
                'geojson' => $unclosed,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['geojson']);
    }

    public function test_supervisor_cannot_edit_but_can_list_territories(): void
    {
        [$company, , $agent, $supervisor] = $this->seedCompany('FAC-TER005', 'Supervisor Ltd');

        $this->withToken($supervisor->createToken('list', ['*'])->plainTextToken)
            ->getJson('/api/v1/admin/territories?company_id='.$company->id)
            ->assertOk();

        $this->withToken($supervisor->createToken('edit', ['*'])->plainTextToken)
            ->putJson('/api/v1/admin/territories/'.$agent->id, [
                'company_id' => $company->id,
                'name' => 'Nope',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['authorization']);
    }

    public function test_agent_gets_own_territory_and_cannot_access_admin_endpoints(): void
    {
        [$company, , $agent] = $this->seedCompany('FAC-TER006', 'Agent View Ltd');

        $own = $this->withToken($agent->createToken('own', ['*'])->plainTextToken)
            ->getJson('/api/v1/agent/territory?company_id='.$company->id);

        $own->assertOk()
            ->assertJsonPath('data.territory.user_id', $agent->id)
            ->assertJsonPath('data.coverage.user_id', $agent->id);

        $this->withToken($agent->createToken('forbidden', ['*'])->plainTextToken)
            ->getJson('/api/v1/admin/territories?company_id='.$company->id)
            ->assertForbidden();
    }

    public function test_territory_upsert_rejects_non_agent_target(): void
    {
        [$company, $admin, , $supervisor] = $this->seedCompany('FAC-TER007', 'Target Ltd');

        $this->withToken($admin->createToken('target', ['*'])->plainTextToken)
            ->putJson('/api/v1/admin/territories/'.$supervisor->id, [
                'company_id' => $company->id,
                'name' => 'Zone',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['user']);
    }

    private function seedCompany(string $companyId, string $name): array
    {
        $company = Company::create([
            'company_id' => $companyId,
            'name' => $name,
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'Territory mapping',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $admin = User::factory()->create(['email_verified_at' => now()]);
        $agent = User::factory()->create(['email_verified_at' => now(), 'is_active' => true]);
        $supervisor = User::factory()->create(['email_verified_at' => now()]);

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
            [
                'company_id' => $company->id,
                'user_id' => $supervisor->id,
                'role' => 'supervisor',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        return [$company, $admin, $agent, $supervisor];
    }
}
