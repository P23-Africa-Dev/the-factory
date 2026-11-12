<?php

declare(strict_types=1);

namespace Tests\Feature\Task;

use App\Models\Company;
use App\Models\Task;
use App\Models\TaskAssignment;
use App\Models\TaskComment;
use App\Models\TaskSubtask;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TaskSubtaskTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private User $owner;

    private User $admin;

    private User $creator;

    private User $agent;

    private User $otherAgent;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = $this->makeCompany('FAC-SUB001');
        $this->owner = $this->makeMember($this->company, 'owner');
        $this->admin = $this->makeMember($this->company, 'admin');
        $this->creator = $this->makeMember($this->company, 'supervisor');
        $this->agent = $this->makeMember($this->company, 'agent', ['supervisor_user_id' => $this->creator->id]);
        $this->otherAgent = $this->makeMember($this->company, 'agent');
    }

    public function test_create_task_with_three_subtasks_and_rejects_later_due_date(): void
    {
        $due = now()->addDays(5)->toIso8601String();
        $tooLate = now()->addDays(6)->toIso8601String();

        $this->withToken($this->tokenFor($this->creator))
            ->postJson('/api/v1/tasks', [
                'company_id' => $this->company->id,
                'title' => 'Prepare account handoff',
                'description' => 'Hand the account over to the field team with notes.',
                'assigned_agent_id' => $this->agent->id,
                'due_date' => $due,
                'subtasks' => [
                    ['title' => 'Review notes', 'assigned_user_id' => $this->agent->id, 'due_at' => $tooLate],
                ],
            ])
            ->assertStatus(422);

        $response = $this->withToken($this->tokenFor($this->creator))
            ->postJson('/api/v1/tasks', [
                'company_id' => $this->company->id,
                'title' => 'Prepare account handoff',
                'description' => 'Hand the account over to the field team with notes.',
                'assigned_agent_id' => $this->agent->id,
                'due_date' => $due,
                'subtasks' => [
                    ['title' => 'Review notes', 'assigned_user_id' => $this->agent->id, 'due_at' => now()->addDay()->toIso8601String()],
                    ['title' => 'Draft summary', 'assigned_user_id' => $this->otherAgent->id],
                    ['title' => 'Share the handoff'],
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('data.task.subtasks_summary.total', 3)
            ->assertJsonPath('data.task.subtasks_summary.completed', 0)
            ->assertJsonCount(3, 'data.task.subtasks');

        $this->assertSame(0, $response->json('data.task.subtasks.0.position'));
        $this->assertSame(1, $response->json('data.task.subtasks.1.position'));
        $this->assertSame(2, $response->json('data.task.subtasks.2.position'));
        $this->assertSame($this->agent->id, $response->json('data.task.subtasks.2.assignee.id'));
    }

    public function test_agent_self_task_rejects_subtasks_assigned_to_someone_else(): void
    {
        $this->withToken($this->tokenFor($this->agent))
            ->postJson('/api/v1/agent/tasks/self', [
                'company_id' => $this->company->id,
                'title' => 'Self checklist',
                'description' => 'Agent creates a personal checklist task.',
                'subtasks' => [
                    ['title' => 'Step one', 'assigned_user_id' => $this->otherAgent->id],
                ],
            ])
            ->assertStatus(422);
    }

    public function test_non_creator_cannot_manage_subtasks(): void
    {
        $task = $this->makeTaskWithSubtasks();
        $subtask = $task->subtasks()->firstOrFail();

        foreach ([$this->owner, $this->admin, $this->agent] as $user) {
            $this->withToken($this->tokenFor($user))
                ->postJson("/api/v1/tasks/{$task->id}/subtasks", [
                    'company_id' => $this->company->id,
                    'title' => 'Extra step',
                ])
                ->assertForbidden();

            $this->withToken($this->tokenFor($user))
                ->patchJson("/api/v1/tasks/{$task->id}/subtasks/{$subtask->id}", [
                    'company_id' => $this->company->id,
                    'title' => 'Renamed',
                ])
                ->assertForbidden();

            $this->withToken($this->tokenFor($user))
                ->patchJson("/api/v1/tasks/{$task->id}/subtasks/reorder", [
                    'company_id' => $this->company->id,
                    'subtask_ids' => $task->subtasks()->pluck('id')->all(),
                ])
                ->assertForbidden();

            $this->withToken($this->tokenFor($user))
                ->deleteJson("/api/v1/tasks/{$task->id}/subtasks/{$subtask->id}?company_id={$this->company->id}")
                ->assertForbidden();
        }
    }

    public function test_assignee_and_creator_can_complete_others_cannot(): void
    {
        $task = $this->makeTaskWithSubtasks();
        $subtask = $task->subtasks()->where('assigned_user_id', $this->agent->id)->firstOrFail();

        $this->withToken($this->tokenFor($this->otherAgent))
            ->patchJson("/api/v1/tasks/{$task->id}/subtasks/{$subtask->id}/complete", [
                'company_id' => $this->company->id,
                'is_completed' => true,
            ])
            ->assertForbidden();

        $this->withToken($this->tokenFor($this->agent))
            ->patchJson("/api/v1/tasks/{$task->id}/subtasks/{$subtask->id}/complete", [
                'company_id' => $this->company->id,
                'is_completed' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.subtask.is_completed', true)
            ->assertJsonPath('data.status_changed', true)
            ->assertJsonPath('data.task.status', 'in_progress');

        $this->withToken($this->tokenFor($this->creator))
            ->patchJson("/api/v1/tasks/{$task->id}/subtasks/{$subtask->id}/complete", [
                'company_id' => $this->company->id,
                'is_completed' => false,
            ])
            ->assertOk()
            ->assertJsonPath('data.subtask.is_completed', false);
    }

    public function test_status_moves_on_first_last_and_untick(): void
    {
        $task = $this->makeTaskWithSubtasks(count: 2);
        $first = $task->subtasks()->orderBy('position')->firstOrFail();
        $second = $task->subtasks()->orderBy('position')->skip(1)->firstOrFail();

        $this->withToken($this->tokenFor($this->creator))
            ->patchJson("/api/v1/tasks/{$task->id}/subtasks/{$first->id}/complete", [
                'company_id' => $this->company->id,
                'is_completed' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.task.status', 'in_progress')
            ->assertJsonPath('data.status_changed', true);

        $this->assertNotNull($task->fresh()->started_at);

        $this->withToken($this->tokenFor($this->creator))
            ->patchJson("/api/v1/tasks/{$task->id}/subtasks/{$second->id}/complete", [
                'company_id' => $this->company->id,
                'is_completed' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.task.status', 'completed')
            ->assertJsonPath('data.status_changed', true);

        $this->assertNotNull($task->fresh()->completed_at);

        $this->withToken($this->tokenFor($this->creator))
            ->patchJson("/api/v1/tasks/{$task->id}/subtasks/{$second->id}/complete", [
                'company_id' => $this->company->id,
                'is_completed' => false,
            ])
            ->assertOk()
            ->assertJsonPath('data.task.status', 'in_progress');

        $this->assertNull($task->fresh()->completed_at);
    }

    public function test_ticking_only_subtask_on_pending_sets_both_timestamps(): void
    {
        $task = $this->makeTaskWithSubtasks(count: 1);
        $subtask = $task->subtasks()->firstOrFail();

        $this->withToken($this->tokenFor($this->creator))
            ->patchJson("/api/v1/tasks/{$task->id}/subtasks/{$subtask->id}/complete", [
                'company_id' => $this->company->id,
                'is_completed' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.task.status', 'completed');

        $fresh = $task->fresh();
        $this->assertNotNull($fresh->started_at);
        $this->assertNotNull($fresh->completed_at);
    }

    public function test_completion_blocked_when_proofs_missing(): void
    {
        $task = $this->makeTaskWithSubtasks(count: 1, minimumPhotos: 1);
        $subtask = $task->subtasks()->firstOrFail();

        $this->withToken($this->tokenFor($this->creator))
            ->patchJson("/api/v1/tasks/{$task->id}/subtasks/{$subtask->id}/complete", [
                'company_id' => $this->company->id,
                'is_completed' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.task.status', 'in_progress')
            ->assertJsonPath('data.subtask.is_completed', true)
            ->assertJsonPath(
                'data.completion_blocked_reason',
                'Minimum 1 proof image(s) required before completion.',
            );
    }

    public function test_cancelled_task_rejects_subtask_writes(): void
    {
        $task = $this->makeTaskWithSubtasks(count: 1);
        $task->update(['status' => 'cancelled']);
        $subtask = $task->subtasks()->firstOrFail();

        $this->withToken($this->tokenFor($this->creator))
            ->postJson("/api/v1/tasks/{$task->id}/subtasks", [
                'company_id' => $this->company->id,
                'title' => 'Nope',
            ])
            ->assertStatus(422)
            ->assertJsonPath('errors.status.0', 'Terminal tasks cannot be changed.');

        $this->withToken($this->tokenFor($this->creator))
            ->patchJson("/api/v1/tasks/{$task->id}/subtasks/{$subtask->id}/complete", [
                'company_id' => $this->company->id,
                'is_completed' => true,
            ])
            ->assertStatus(422);
    }

    public function test_deleting_last_open_subtask_completes_and_deleting_all_leaves_status(): void
    {
        $task = $this->makeTaskWithSubtasks(count: 2);
        $first = $task->subtasks()->orderBy('position')->firstOrFail();
        $second = $task->subtasks()->orderBy('position')->skip(1)->firstOrFail();

        $this->withToken($this->tokenFor($this->creator))
            ->patchJson("/api/v1/tasks/{$task->id}/subtasks/{$first->id}/complete", [
                'company_id' => $this->company->id,
                'is_completed' => true,
            ])
            ->assertOk();

        $this->withToken($this->tokenFor($this->creator))
            ->deleteJson("/api/v1/tasks/{$task->id}/subtasks/{$second->id}?company_id={$this->company->id}")
            ->assertOk()
            ->assertJsonPath('data.task.status', 'completed')
            ->assertJsonPath('data.status_changed', true);

        $remaining = $task->fresh()->subtasks()->firstOrFail();
        $this->withToken($this->tokenFor($this->creator))
            ->deleteJson("/api/v1/tasks/{$task->id}/subtasks/{$remaining->id}?company_id={$this->company->id}")
            ->assertOk()
            ->assertJsonPath('data.task.status', 'completed')
            ->assertJsonPath('data.status_changed', false)
            ->assertJsonCount(0, 'data.task.subtasks');
    }

    public function test_reorder_requires_exact_ids(): void
    {
        $task = $this->makeTaskWithSubtasks(count: 3);
        $ids = $task->subtasks()->orderBy('position')->pluck('id')->all();

        $this->withToken($this->tokenFor($this->creator))
            ->patchJson("/api/v1/tasks/{$task->id}/subtasks/reorder", [
                'company_id' => $this->company->id,
                'subtask_ids' => [$ids[0], $ids[1]],
            ])
            ->assertStatus(422);

        $reordered = array_reverse($ids);
        $this->withToken($this->tokenFor($this->creator))
            ->patchJson("/api/v1/tasks/{$task->id}/subtasks/reorder", [
                'company_id' => $this->company->id,
                'subtask_ids' => $reordered,
            ])
            ->assertOk()
            ->assertJsonPath('data.task.subtasks.0.id', $reordered[0]);
    }

    public function test_patch_task_due_date_cannot_precede_subtask(): void
    {
        $task = $this->makeTaskWithSubtasks(count: 1);
        $subtask = $task->subtasks()->firstOrFail();
        $subtask->update(['due_at' => now()->addDays(4)]);

        $this->withToken($this->tokenFor($this->creator))
            ->patchJson("/api/v1/tasks/{$task->id}", [
                'company_id' => $this->company->id,
                'due_date' => now()->addDays(2)->toIso8601String(),
            ])
            ->assertStatus(422)
            ->assertJsonPath('errors.due_date.0', 'The task due date cannot be earlier than a subtask due date.');
    }

    public function test_list_and_detail_include_subtasks_and_comments_count(): void
    {
        $task = $this->makeTaskWithSubtasks(count: 2);
        TaskComment::create([
            'company_id' => $this->company->id,
            'task_id' => $task->id,
            'author_user_id' => $this->creator->id,
            'body' => 'First note',
        ]);
        TaskComment::create([
            'company_id' => $this->company->id,
            'task_id' => $task->id,
            'author_user_id' => $this->agent->id,
            'body' => 'Second note',
        ]);

        $this->withToken($this->tokenFor($this->creator))
            ->getJson("/api/v1/tasks?company_id={$this->company->id}")
            ->assertOk()
            ->assertJsonPath('data.items.0.comments_count', 2)
            ->assertJsonPath('data.items.0.subtasks_summary.total', 2)
            ->assertJsonCount(2, 'data.items.0.subtasks');

        $this->withToken($this->tokenFor($this->creator))
            ->getJson("/api/v1/tasks/{$task->id}?company_id={$this->company->id}")
            ->assertOk()
            ->assertJsonPath('data.task.comments_count', 2)
            ->assertJsonCount(2, 'data.task.subtasks');
    }

    public function test_agent_sees_other_subtask_assignees_and_subtask_only_visibility(): void
    {
        $task = $this->makeTask($this->creator, [$this->agent]);
        TaskSubtask::create([
            'company_id' => $this->company->id,
            'task_id' => $task->id,
            'assigned_user_id' => $this->otherAgent->id,
            'created_by_user_id' => $this->creator->id,
            'title' => 'Other agent step',
            'position' => 0,
        ]);

        $this->withToken($this->tokenFor($this->agent))
            ->getJson("/api/v1/agent/tasks/{$task->id}?company_id={$this->company->id}")
            ->assertOk()
            ->assertJsonPath('data.task.subtasks.0.assignee.id', $this->otherAgent->id);

        $orphan = $this->makeTask($this->creator, [$this->agent]);
        TaskSubtask::create([
            'company_id' => $this->company->id,
            'task_id' => $orphan->id,
            'assigned_user_id' => $this->otherAgent->id,
            'created_by_user_id' => $this->creator->id,
            'title' => 'Visible via subtask only',
            'position' => 0,
        ]);
        $orphan->update(['assigned_agent_id' => $this->agent->id]);
        TaskAssignment::query()->where('task_id', $orphan->id)->update([
            'assigned_agent_id' => $this->agent->id,
            'is_current' => false,
            'unassigned_at' => now(),
        ]);
        // Give otherAgent visibility only through the subtask, with no current assignment.
        $orphan->update(['assigned_agent_id' => null]);

        $this->withToken($this->tokenFor($this->otherAgent))
            ->getJson("/api/v1/agent/tasks?company_id={$this->company->id}")
            ->assertOk()
            ->assertJsonFragment(['id' => $orphan->id]);
    }

    private function makeTaskWithSubtasks(int $count = 3, int $minimumPhotos = 0): Task
    {
        $task = $this->makeTask($this->creator, [$this->agent], minimumPhotos: $minimumPhotos);

        for ($i = 0; $i < $count; $i++) {
            TaskSubtask::create([
                'company_id' => $this->company->id,
                'task_id' => $task->id,
                'assigned_user_id' => $this->agent->id,
                'created_by_user_id' => $this->creator->id,
                'title' => "Step {$i}",
                'position' => $i,
            ]);
        }

        return $task->fresh(['subtasks']);
    }

    /**
     * @param  array<int, User>  $assignees
     */
    private function makeTask(User $creator, array $assignees, int $minimumPhotos = 0): Task
    {
        $task = Task::create([
            'company_id' => $this->company->id,
            'created_by_user_id' => $creator->id,
            'assigned_agent_id' => $assignees[0]->id ?? null,
            'title' => 'Subtask test task',
            'type' => 'inspection',
            'description' => 'Visit the site and record findings carefully.',
            'status' => 'pending',
            'due_at' => now()->addDays(5),
            'minimum_photos_required' => $minimumPhotos,
            'visit_verification_required' => false,
        ]);

        foreach ($assignees as $assignee) {
            TaskAssignment::create([
                'task_id' => $task->id,
                'assigned_by_user_id' => $creator->id,
                'assigned_agent_id' => $assignee->id,
                'assigned_at' => now(),
                'is_current' => true,
            ]);
        }

        return $task;
    }

    private function tokenFor(User $user): string
    {
        $this->app['auth']->forgetGuards();

        return $user->createToken('test-token', ['*'])->plainTextToken;
    }

    private function makeCompany(string $code): Company
    {
        return Company::create([
            'company_id' => $code,
            'name' => 'Subtask Co '.$code,
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Field operations',
            'status' => 'active',
            'activated_at' => now(),
        ]);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function makeMember(Company $company, string $role, array $attributes = []): User
    {
        $user = User::factory()->create(array_merge(['email_verified_at' => now()], $attributes));

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
