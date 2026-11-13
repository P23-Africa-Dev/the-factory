<?php

declare(strict_types=1);

namespace Tests\Feature\Task;

use App\Models\AppNotification;
use App\Models\Company;
use App\Models\Task;
use App\Models\User;
use App\Notifications\TaskObserverAddedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class TaskObserverTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private User $admin;

    private User $assignee;

    private User $observer;

    private User $outsider;

    protected function setUp(): void
    {
        parent::setUp();

        Notification::fake();

        $this->company = $this->makeCompany('FAC-OBS001');
        $this->admin = $this->makeMember($this->company, 'admin');
        $this->assignee = $this->makeMember($this->company, 'agent');
        $this->observer = $this->makeMember($this->company, 'agent');
        $this->outsider = $this->makeMember($this->company, 'agent');
    }

    public function test_manager_can_create_a_task_with_observers(): void
    {
        $response = $this->createAsAdmin(['observer_ids' => [$this->observer->id]])
            ->assertCreated()
            ->assertJsonPath('data.task.observers.0.id', $this->observer->id)
            ->assertJsonPath('data.task.observers.0.name', $this->observer->name)
            ->assertJsonPath('data.task.is_observer', false);

        $this->assertNotNull($response->json('data.task.observers.0.avatar_url'));
        $this->assertDatabaseHas('task_observers', [
            'task_id' => $response->json('data.task.id'),
            'user_id' => $this->observer->id,
            'added_by_user_id' => $this->admin->id,
        ]);
    }

    public function test_observers_are_notified_in_app_and_by_email(): void
    {
        $taskId = $this->createAsAdmin(['observer_ids' => [$this->observer->id]])->json('data.task.id');

        Notification::assertSentTo($this->observer, TaskObserverAddedNotification::class);
        Notification::assertNotSentTo($this->assignee, TaskObserverAddedNotification::class);

        $this->assertTrue(AppNotification::query()
            ->where('user_id', $this->observer->id)
            ->where('type', 'task.observer_added')
            ->where('reference_id', $taskId)
            ->exists());
    }

    public function test_assignee_listed_as_observer_is_dropped(): void
    {
        $this->createAsAdmin(['observer_ids' => [$this->assignee->id, $this->observer->id]])
            ->assertCreated()
            ->assertJsonCount(1, 'data.task.observers')
            ->assertJsonPath('data.task.observers.0.id', $this->observer->id);
    }

    public function test_observer_from_another_company_is_rejected(): void
    {
        $otherCompany = $this->makeCompany('FAC-OBS002');
        $stranger = $this->makeMember($otherCompany, 'agent');

        $this->createAsAdmin(['observer_ids' => [$stranger->id]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['observer_ids']);

        $this->assertSame(0, Task::query()->count());
    }

    public function test_observer_sees_the_task_on_their_board_and_in_details(): void
    {
        $taskId = $this->createAsAdmin(['observer_ids' => [$this->observer->id]])->json('data.task.id');

        $list = $this->as($this->observer)->getJson('/api/v1/tasks?company_id='.$this->company->id)->assertOk();
        $listed = collect($list->json('data.items') ?? $list->json('data.tasks') ?? [])->firstWhere('id', $taskId);
        $this->assertNotNull($listed, 'Observed task should appear in the observer\'s task list.');
        $this->assertTrue($listed['is_observer']);

        $this->as($this->observer)->getJson("/api/v1/tasks/{$taskId}?company_id={$this->company->id}")
            ->assertOk()
            ->assertJsonPath('data.task.is_observer', true)
            ->assertJsonPath('data.task.assignee.id', $this->assignee->id);
    }

    public function test_unrelated_agent_cannot_see_the_task(): void
    {
        $taskId = $this->createAsAdmin(['observer_ids' => [$this->observer->id]])->json('data.task.id');

        $list = $this->as($this->outsider)->getJson('/api/v1/tasks?company_id='.$this->company->id)->assertOk();
        $this->assertNull(collect($list->json('data.items') ?? $list->json('data.tasks') ?? [])->firstWhere('id', $taskId));

        $this->as($this->outsider)->getJson("/api/v1/tasks/{$taskId}?company_id={$this->company->id}")
            ->assertUnprocessable();
    }

    public function test_observer_cannot_change_task_status(): void
    {
        $taskId = $this->createAsAdmin(['observer_ids' => [$this->observer->id]])->json('data.task.id');

        $this->as($this->observer)->patchJson("/api/v1/tasks/{$taskId}/status", [
            'company_id' => $this->company->id,
            'status' => 'in_progress',
        ])->assertUnprocessable();

        $this->assertSame('pending', Task::query()->findOrFail($taskId)->status->value);
    }

    public function test_observer_can_comment_and_participants_are_notified(): void
    {
        $taskId = $this->createAsAdmin(['observer_ids' => [$this->observer->id]])->json('data.task.id');

        $this->as($this->observer)->getJson("/api/v1/tasks/{$taskId}/comments")
            ->assertOk()
            ->assertJsonPath('data.can_comment', true);

        $commentId = $this->as($this->observer)->postJson("/api/v1/tasks/{$taskId}/comments", [
            'body' => 'Any update on this visit?',
        ])->assertCreated()->json('data.comment.id');

        foreach ([$this->assignee, $this->admin] as $recipient) {
            $this->assertTrue(AppNotification::query()
                ->where('user_id', $recipient->id)
                ->where('type', 'task.comment_added')
                ->where('reference_id', $taskId)
                ->exists(), "User {$recipient->id} should be notified of the comment.");
        }

        // The author is not notified of their own comment.
        $this->assertFalse(AppNotification::query()
            ->where('user_id', $this->observer->id)
            ->where('type', 'task.comment_added')
            ->exists());

        $this->assertNotNull($commentId);
    }

    public function test_observer_is_notified_when_the_assignee_comments(): void
    {
        $taskId = $this->createAsAdmin(['observer_ids' => [$this->observer->id]])->json('data.task.id');

        $this->as($this->assignee)->postJson("/api/v1/tasks/{$taskId}/comments", [
            'body' => 'On my way to the site now.',
        ])->assertCreated();

        $this->assertTrue(AppNotification::query()
            ->where('user_id', $this->observer->id)
            ->where('type', 'task.comment_added')
            ->where('reference_id', $taskId)
            ->exists());
    }

    public function test_update_replaces_observers_and_notifies_only_new_ones(): void
    {
        $taskId = $this->createAsAdmin(['observer_ids' => [$this->observer->id]])->json('data.task.id');
        $newObserver = $this->makeMember($this->company, 'supervisor');

        $this->as($this->admin)->patchJson("/api/v1/tasks/{$taskId}", [
            'company_id' => $this->company->id,
            'observer_ids' => [$newObserver->id],
        ])
            ->assertOk()
            ->assertJsonCount(1, 'data.task.observers')
            ->assertJsonPath('data.task.observers.0.id', $newObserver->id);

        $this->assertDatabaseMissing('task_observers', ['task_id' => $taskId, 'user_id' => $this->observer->id]);
        Notification::assertSentTo($newObserver, TaskObserverAddedNotification::class);
        Notification::assertSentToTimes($this->observer, TaskObserverAddedNotification::class, 1);

        $this->as($this->admin)->patchJson("/api/v1/tasks/{$taskId}", [
            'company_id' => $this->company->id,
            'observer_ids' => [],
        ])->assertOk()->assertJsonCount(0, 'data.task.observers');
    }

    public function test_agent_can_add_observers_to_their_own_self_task(): void
    {
        $response = $this->as($this->assignee)->postJson('/api/v1/agent/tasks/self', [
            'company_id' => $this->company->id,
            'title' => 'Agent self task',
            'observer_ids' => [$this->admin->id],
        ])->assertCreated();

        $response->assertJsonPath('data.task.observers.0.id', $this->admin->id);
        Notification::assertSentTo($this->admin, TaskObserverAddedNotification::class);
    }

    public function test_assigned_agent_cannot_change_observers_on_a_task_they_did_not_create(): void
    {
        $taskId = $this->createAsAdmin(['observer_ids' => [$this->observer->id]])->json('data.task.id');

        $this->as($this->assignee)->patchJson("/api/v1/tasks/{$taskId}", [
            'company_id' => $this->company->id,
            'title' => 'Renamed by assignee',
            'observer_ids' => [],
        ])->assertOk();

        $this->assertDatabaseHas('task_observers', ['task_id' => $taskId, 'user_id' => $this->observer->id]);
    }

    public function test_any_member_can_list_observer_candidates(): void
    {
        $response = $this->as($this->assignee)
            ->getJson('/api/v1/agent/tasks/observer-candidates?company_id='.$this->company->id)
            ->assertOk();

        $ids = collect($response->json('data.items'))->pluck('id')->all();
        foreach ([$this->admin, $this->assignee, $this->observer, $this->outsider] as $member) {
            $this->assertContains($member->id, $ids);
        }
        $this->assertArrayHasKey('avatar_url', $response->json('data.items.0'));
    }

    private function createAsAdmin(array $overrides): TestResponse
    {
        return $this->as($this->admin)->postJson('/api/v1/tasks', array_merge([
            'company_id' => $this->company->id,
            'title' => 'Observed task',
            'assigned_agent_id' => $this->assignee->id,
        ], $overrides));
    }

    private function as(User $user): static
    {
        // Each request acts as a different user; drop the cached guard user.
        $this->app['auth']->forgetGuards();

        return $this->withToken($user->createToken('test-token', ['*'])->plainTextToken);
    }

    private function makeCompany(string $code): Company
    {
        return Company::create([
            'company_id' => $code,
            'name' => 'Observer Co '.$code,
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'Field operations',
            'status' => 'active',
            'activated_at' => now(),
        ]);
    }

    private function makeMember(Company $company, string $role): User
    {
        $user = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'role' => $role,
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $user;
    }
}
