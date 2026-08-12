<?php

declare(strict_types=1);

namespace Tests\Feature\Task;

use App\Models\Company;
use App\Models\Task;
use App\Models\TaskLocationPoint;
use App\Models\TaskTrackingSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TaskTrackingRegressionTest extends TestCase
{
    use RefreshDatabase;

    public function test_second_start_is_rejected_when_tracking_already_active(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers('FAC-TRACK-DBL');

        $task = $this->createAssignedTask($company->id, $admin->id, $agent->id, [
            'status' => 'pending',
            'latitude' => 6.4300,
            'longitude' => 3.4200,
        ]);

        $token = $agent->createToken('double-start-token', ['*'])->plainTextToken;
        $payload = [
            'company_id' => $company->id,
            'location_permission_granted' => true,
            'latitude' => 6.4000,
            'longitude' => 3.3900,
            'accuracy_meters' => 5,
        ];

        $this->withToken($token)
            ->postJson('/api/v1/tasks/' . $task->id . '/start', $payload)
            ->assertOk();

        $this->withToken($token)
            ->postJson('/api/v1/tasks/' . $task->id . '/start', $payload)
            ->assertUnprocessable()
            ->assertJsonPath('errors.tracking.0', 'Tracking is already active for this task.');

        $this->assertSame(1, TaskTrackingSession::query()->where('task_id', $task->id)->whereNull('end_recorded_at')->count());
    }

    public function test_route_limit_returns_at_most_n_latest_points_ordered_ascending(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers('FAC-TRACK-LIMIT');

        $task = $this->createAssignedTask($company->id, $admin->id, $agent->id, [
            'status' => 'in_progress',
        ]);

        $session = TaskTrackingSession::query()->create([
            'task_id' => $task->id,
            'company_id' => $company->id,
            'started_by_user_id' => $agent->id,
            'start_latitude' => 6.4000,
            'start_longitude' => 3.3900,
            'start_accuracy_meters' => 5,
            'start_recorded_at' => now()->subMinutes(10),
            'last_latitude' => 6.4050,
            'last_longitude' => 3.3950,
            'last_accuracy_meters' => 5,
            'last_recorded_at' => now()->subMinute(),
            'last_persisted_latitude' => 6.4050,
            'last_persisted_longitude' => 3.3950,
            'last_persisted_recorded_at' => now()->subMinute(),
            'destination_latitude' => 6.4300,
            'destination_longitude' => 3.4200,
            'destination_radius_meters' => 100,
        ]);

        foreach ([1, 2, 3, 4, 5] as $offset) {
            TaskLocationPoint::query()->create([
                'tracking_session_id' => $session->id,
                'task_id' => $task->id,
                'company_id' => $company->id,
                'user_id' => $agent->id,
                'latitude' => 6.4000 + ($offset * 0.001),
                'longitude' => 3.3900 + ($offset * 0.001),
                'accuracy_meters' => 5,
                'speed_mps' => null,
                'heading_degrees' => null,
                'event_type' => $offset === 1 ? 'start' : 'movement',
                'is_checkpoint' => $offset === 1,
                'recorded_at' => now()->subMinutes(10 - $offset),
            ]);
        }

        $token = $agent->createToken('route-limit-token', ['*'])->plainTextToken;

        $response = $this->withToken($token)
            ->getJson('/api/v1/tasks/' . $task->id . '/route?company_id=' . $company->id . '&limit=2');

        $response->assertOk();

        $points = $response->json('data.points');
        $this->assertIsArray($points);
        $this->assertCount(2, $points);
        $this->assertSame(5, $response->json('data.summary.points_count'));

        $recordedAts = array_map(
            static fn (array $point): string => (string) $point['recorded_at'],
            $points,
        );
        $sorted = $recordedAts;
        sort($sorted);
        $this->assertSame($sorted, $recordedAts);

        // Latest two of five: offsets 4 and 5.
        $this->assertEqualsWithDelta(6.4040, (float) $points[0]['latitude'], 0.0001);
        $this->assertEqualsWithDelta(6.4050, (float) $points[1]['latitude'], 0.0001);
    }

    public function test_accuracy_zero_still_allows_near_and_arrival(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers('FAC-TRACK-ACC0');

        $task = $this->createAssignedTask($company->id, $admin->id, $agent->id, [
            'status' => 'pending',
            'latitude' => 6.4300,
            'longitude' => 3.4200,
        ]);

        $token = $agent->createToken('accuracy-zero-token', ['*'])->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/v1/tasks/' . $task->id . '/start', [
                'company_id' => $company->id,
                'location_permission_granted' => true,
                'latitude' => 6.4000,
                'longitude' => 3.3900,
                'accuracy_meters' => 0,
            ])
            ->assertOk();

        $nearResponse = $this->withToken($token)
            ->postJson('/api/v1/tasks/' . $task->id . '/location', [
                'company_id' => $company->id,
                'points' => [
                    [
                        'latitude' => 6.4100,
                        'longitude' => 3.4000,
                        'accuracy_meters' => 0,
                        'recorded_at' => now()->addMinute()->toISOString(),
                    ],
                    [
                        'latitude' => 6.4301,
                        'longitude' => 3.4201,
                        'accuracy_meters' => 0,
                        'recorded_at' => now()->addMinutes(2)->toISOString(),
                    ],
                ],
            ]);

        $nearResponse->assertOk()
            ->assertJsonPath('data.near_destination', true)
            ->assertJsonPath('data.arrived', false);

        $arrivalResponse = $this->withToken($token)
            ->postJson('/api/v1/tasks/' . $task->id . '/location', [
                'company_id' => $company->id,
                'points' => [
                    [
                        'latitude' => 6.4302,
                        'longitude' => 3.4202,
                        'accuracy_meters' => 0,
                        'recorded_at' => now()->addMinutes(3)->toISOString(),
                    ],
                ],
            ]);

        $arrivalResponse->assertOk()
            ->assertJsonPath('data.arrived', true)
            ->assertJsonPath('data.proximity_state', 'arrived');
    }

    public function test_out_of_order_points_are_processed_chronologically(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers('FAC-TRACK-OOO');

        $task = $this->createAssignedTask($company->id, $admin->id, $agent->id, [
            'status' => 'pending',
            'latitude' => 6.4300,
            'longitude' => 3.4200,
        ]);

        $token = $agent->createToken('ooo-token', ['*'])->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/v1/tasks/' . $task->id . '/start', [
                'company_id' => $company->id,
                'location_permission_granted' => true,
                'latitude' => 6.4000,
                'longitude' => 3.3900,
                'accuracy_meters' => 5,
            ])
            ->assertOk();

        // Send near point (T+2) before the intermediate point (T+1). After sort,
        // intermediate is processed first so near detection still fires correctly.
        $response = $this->withToken($token)
            ->postJson('/api/v1/tasks/' . $task->id . '/location', [
                'company_id' => $company->id,
                'points' => [
                    [
                        'latitude' => 6.4301,
                        'longitude' => 3.4201,
                        'accuracy_meters' => 5,
                        'recorded_at' => now()->addMinutes(2)->toISOString(),
                    ],
                    [
                        'latitude' => 6.4100,
                        'longitude' => 3.4000,
                        'accuracy_meters' => 5,
                        'recorded_at' => now()->addMinute()->toISOString(),
                    ],
                ],
            ]);

        $response->assertOk()
            ->assertJsonPath('data.near_destination', true)
            ->assertJsonPath('data.arrived', false);

        $session = TaskTrackingSession::query()->where('task_id', $task->id)->firstOrFail();
        $this->assertNotNull($session->near_detected_at);
        $this->assertEqualsWithDelta(6.4301, (float) $session->last_latitude, 0.0001);
        $this->assertEqualsWithDelta(3.4201, (float) $session->last_longitude, 0.0001);
    }

    private function createAssignedTask(int $companyId, int $creatorId, int $agentId, array $overrides = []): Task
    {
        $task = Task::create(array_merge([
            'company_id' => $companyId,
            'created_by_user_id' => $creatorId,
            'assigned_agent_id' => $agentId,
            'title' => 'Tracking Regression Task',
            'type' => 'inspection',
            'description' => 'Tracking regression lifecycle task.',
            'location_text' => 'Lagos',
            'address_full' => 'Plot 1, Lagos',
            'latitude' => 6.4300,
            'longitude' => 3.4200,
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

    private function seedCompanyUsers(string $companyCode = 'FAC-TRACK-REG'): array
    {
        $company = Company::create([
            'company_id' => $companyCode,
            'name' => 'Tracking Regression Ltd',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Field tracking regression',
            'status' => 'active',
            'activated_at' => now(),
        ]);

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
