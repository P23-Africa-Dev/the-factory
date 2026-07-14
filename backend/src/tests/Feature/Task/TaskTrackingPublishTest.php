<?php

declare(strict_types=1);

namespace Tests\Feature\Task;

use App\Models\Company;
use App\Models\Task;
use App\Models\User;
use App\Support\AvatarUrlResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Mockery;
use Tests\TestCase;

class TaskTrackingPublishTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_tracking_start_publishes_agent_avatar_url_on_pubsub_connection(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $agent->forceFill([
            'gender' => 'female',
            'avatar' => null,
        ])->save();

        $expectedAvatarUrl = AvatarUrlResolver::resolveOrDefault(null, 'female');

        $published = [];
        $connection = Mockery::mock();
        $connection->shouldReceive('publish')
            ->atLeast()
            ->once()
            ->andReturnUsing(function (string $channel, string $payload) use (&$published): int {
                $published[] = [
                    'channel' => $channel,
                    'payload' => json_decode($payload, true, 512, JSON_THROW_ON_ERROR),
                ];

                return 1;
            });

        Redis::shouldReceive('connection')
            ->with('pubsub')
            ->andReturn($connection);

        $task = $this->createAssignedTask($company->id, $admin->id, $agent->id, [
            'status' => 'pending',
            'latitude' => 6.4300,
            'longitude' => 3.4200,
        ]);

        $this->withToken($agent->createToken('agent-publish-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/tasks/' . $task->id . '/start', [
                'company_id' => $company->id,
                'location_permission_granted' => true,
                'latitude' => 6.4000,
                'longitude' => 3.3900,
                'accuracy_meters' => 5,
            ])
            ->assertOk();

        $this->assertNotEmpty($published);

        $locationEvent = collect($published)->first(
            fn (array $entry): bool => ($entry['payload']['event'] ?? null) === 'tracking.location.updated',
        );

        $this->assertNotNull($locationEvent);
        $this->assertStringContainsString(
            'factory23.tracking',
            (string) ($locationEvent['channel'] ?? ''),
        );
        $this->assertSame(
            $expectedAvatarUrl,
            $locationEvent['payload']['data']['agent']['avatar_url'] ?? null,
        );
        $this->assertSame($agent->id, $locationEvent['payload']['data']['agent']['id'] ?? null);
    }

    private function createAssignedTask(int $companyId, int $creatorId, int $agentId, array $overrides = []): Task
    {
        $task = Task::query()->create(array_merge([
            'company_id' => $companyId,
            'created_by_user_id' => $creatorId,
            'assigned_agent_id' => $agentId,
            'title' => 'Tracking Publish Task',
            'type' => 'inspection',
            'description' => 'Tracking publish test task.',
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

    private function seedCompanyUsers(string $companyCode = 'FAC-TRACKPUB'): array
    {
        $company = Company::query()->create([
            'company_id' => $companyCode,
            'name' => 'Tracking Publish Factory Ltd',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Field tracking publish',
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
