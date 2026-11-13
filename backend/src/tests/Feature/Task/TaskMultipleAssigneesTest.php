<?php

declare(strict_types=1);

namespace Tests\Feature\Task;

use App\Models\AppNotification;
use App\Models\Company;
use App\Models\Task;
use App\Models\TaskAssignment;
use App\Models\User;
use App\Notifications\TaskAssignedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class TaskMultipleAssigneesTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private User $admin;

    private User $first;

    private User $second;

    private User $third;

    protected function setUp(): void
    {
        parent::setUp();

        Notification::fake();

        $this->company = Company::create([
            'company_id' => 'FAC-MULTI01',
            'name' => 'Multi Assignee Co',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'Field operations',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $this->admin = $this->makeMember('admin');
        $this->first = $this->makeMember('agent');
        $this->second = $this->makeMember('agent');
        $this->third = $this->makeMember('agent');
    }

    public function test_manager_can_assign_a_task_to_several_people(): void
    {
        $response = $this->createAsAdmin(['assigned_agent_ids' => [$this->first->id, $this->second->id]])
            ->assertCreated()
            ->assertJsonPath('data.task.assigned_agent_id', $this->first->id)
            ->assertJsonCount(2, 'data.task.assigned_users');

        $taskId = $response->json('data.task.id');
        $this->assertSame(
            [$this->first->id, $this->second->id],
            $this->currentAssigneeIds($taskId),
        );

        Notification::assertSentTo($this->first, TaskAssignedNotification::class);
        Notification::assertSentTo($this->second, TaskAssignedNotification::class);
        Notification::assertNotSentTo($this->third, TaskAssignedNotification::class);
    }

    public function test_pwa_assignee_field_names_are_accepted(): void
    {
        $listTaskId = $this->createAsAdmin(['assignee_ids' => [$this->first->id, $this->second->id]])
            ->assertCreated()
            ->json('data.task.id');
        $this->assertSame([$this->first->id, $this->second->id], $this->currentAssigneeIds($listTaskId));

        $singleTaskId = $this->createAsAdmin(['assigned_to' => $this->third->id])
            ->assertCreated()
            ->json('data.task.id');
        $this->assertSame([$this->third->id], $this->currentAssigneeIds($singleTaskId));
    }

    public function test_every_assignee_sees_the_task_and_their_co_assignees(): void
    {
        $taskId = $this->createAsAdmin(['assigned_agent_ids' => [$this->first->id, $this->second->id]])
            ->json('data.task.id');

        foreach ([$this->first, $this->second] as $assignee) {
            $list = $this->as($assignee)->getJson('/api/v1/tasks?company_id='.$this->company->id)->assertOk();
            $this->assertNotNull(collect($list->json('data.items'))->firstWhere('id', $taskId));

            $detail = $this->as($assignee)
                ->getJson("/api/v1/tasks/{$taskId}?company_id={$this->company->id}")
                ->assertOk()
                ->assertJsonPath('data.task.assignee.id', $this->first->id);

            $this->assertEqualsCanonicalizing(
                [$this->first->id, $this->second->id],
                collect($detail->json('data.task.assigned_users'))->pluck('id')->all(),
            );
        }

        $this->as($this->third)->getJson("/api/v1/tasks/{$taskId}?company_id={$this->company->id}")
            ->assertUnprocessable();
    }

    public function test_any_assignee_can_update_the_shared_status(): void
    {
        $taskId = $this->createAsAdmin(['assigned_agent_ids' => [$this->first->id, $this->second->id]])
            ->json('data.task.id');

        $this->as($this->second)->patchJson("/api/v1/tasks/{$taskId}/status", [
            'company_id' => $this->company->id,
            'status' => 'in_progress',
        ])->assertOk()->assertJsonPath('data.task.status', 'in_progress');

        $this->as($this->first)->patchJson("/api/v1/tasks/{$taskId}/status", [
            'company_id' => $this->company->id,
            'status' => 'completed',
        ])->assertOk()->assertJsonPath('data.task.status', 'completed');
    }

    public function test_manager_can_change_assignees_and_only_new_people_are_notified(): void
    {
        $taskId = $this->createAsAdmin(['assigned_agent_ids' => [$this->first->id, $this->second->id]])
            ->json('data.task.id');

        $this->as($this->admin)->patchJson("/api/v1/tasks/{$taskId}", [
            'company_id' => $this->company->id,
            'assigned_agent_ids' => [$this->second->id, $this->third->id],
        ])
            ->assertOk()
            ->assertJsonPath('data.task.assigned_agent_id', $this->second->id)
            ->assertJsonCount(2, 'data.task.assigned_users');

        $this->assertSame([$this->second->id, $this->third->id], $this->currentAssigneeIds($taskId));
        $this->assertDatabaseHas('task_assignments', [
            'task_id' => $taskId,
            'assigned_agent_id' => $this->first->id,
            'is_current' => false,
        ]);

        Notification::assertSentTo($this->third, TaskAssignedNotification::class);
        Notification::assertSentToTimes($this->second, TaskAssignedNotification::class, 1);
        $this->assertTrue(AppNotification::query()
            ->where('user_id', $this->third->id)
            ->where('type', 'task.assigned')
            ->where('reference_id', $taskId)
            ->exists());
    }

    public function test_task_cannot_be_left_without_assignees_on_edit(): void
    {
        $taskId = $this->createAsAdmin(['assigned_agent_ids' => [$this->first->id]])->json('data.task.id');

        $this->as($this->admin)->patchJson("/api/v1/tasks/{$taskId}", [
            'company_id' => $this->company->id,
            'assigned_agent_ids' => [],
        ])->assertUnprocessable()->assertJsonValidationErrors(['assigned_agent_ids']);
    }

    public function test_new_assignee_stops_being_an_observer(): void
    {
        $taskId = $this->createAsAdmin([
            'assigned_agent_ids' => [$this->first->id],
            'observer_ids' => [$this->second->id],
        ])->json('data.task.id');

        $this->as($this->admin)->patchJson("/api/v1/tasks/{$taskId}", [
            'company_id' => $this->company->id,
            'assigned_agent_ids' => [$this->first->id, $this->second->id],
        ])->assertOk()->assertJsonCount(0, 'data.task.observers');

        $this->assertDatabaseMissing('task_observers', ['task_id' => $taskId, 'user_id' => $this->second->id]);
    }

    public function test_assignees_cannot_change_on_a_completed_task(): void
    {
        $taskId = $this->createAsAdmin(['assigned_agent_ids' => [$this->first->id]])->json('data.task.id');
        Task::query()->whereKey($taskId)->update(['status' => 'completed']);

        $this->as($this->admin)->patchJson("/api/v1/tasks/{$taskId}", [
            'company_id' => $this->company->id,
            'assigned_agent_ids' => [$this->second->id],
        ])->assertUnprocessable()->assertJsonValidationErrors(['assigned_agent_ids']);
    }

    public function test_agent_cannot_change_assignees(): void
    {
        $taskId = $this->createAsAdmin(['assigned_agent_ids' => [$this->first->id]])->json('data.task.id');

        $this->as($this->first)->patchJson("/api/v1/tasks/{$taskId}", [
            'company_id' => $this->company->id,
            'title' => 'Renamed by assignee',
            'assigned_agent_ids' => [$this->first->id, $this->third->id],
        ])->assertOk();

        $this->assertSame([$this->first->id], $this->currentAssigneeIds($taskId));
    }

    public function test_second_assignee_is_told_who_is_already_tracking(): void
    {
        $taskId = $this->createAsAdmin([
            'assigned_agent_ids' => [$this->first->id, $this->second->id],
            'latitude' => 6.45,
            'longitude' => 3.35,
            'address' => '12 Main Street',
        ])->json('data.task.id');

        $start = fn (User $user): TestResponse => $this->as($user)->postJson("/api/v1/tasks/{$taskId}/start", [
            'company_id' => $this->company->id,
            'location_permission_granted' => true,
            'latitude' => 6.4501,
            'longitude' => 3.3501,
        ]);

        $start($this->first)->assertSuccessful();

        $start($this->second)
            ->assertUnprocessable()
            ->assertJsonPath('errors.tracking.0', "{$this->first->name} is tracking this task right now. Only one person can track it at a time.");
    }

    /**
     * @return array<int, int>
     */
    private function currentAssigneeIds(int $taskId): array
    {
        return TaskAssignment::query()
            ->where('task_id', $taskId)
            ->where('is_current', true)
            ->orderBy('id')
            ->pluck('assigned_agent_id')
            ->map(static fn (mixed $id): int => (int) $id)
            ->all();
    }

    private function createAsAdmin(array $overrides): TestResponse
    {
        return $this->as($this->admin)->postJson('/api/v1/tasks', array_merge([
            'company_id' => $this->company->id,
            'title' => 'Shared task',
        ], $overrides));
    }

    private function as(User $user): static
    {
        // Each request acts as a different user; drop the cached guard user.
        $this->app['auth']->forgetGuards();

        return $this->withToken($user->createToken('test-token', ['*'])->plainTextToken);
    }

    private function makeMember(string $role): User
    {
        $user = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            'company_id' => $this->company->id,
            'user_id' => $user->id,
            'role' => $role,
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $user;
    }
}
