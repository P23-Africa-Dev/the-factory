<?php

declare(strict_types=1);

namespace Tests\Feature\Task;

use App\Models\Company;
use App\Models\Task;
use App\Models\TaskAssignment;
use App\Models\TaskComment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class TaskCommentTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private User $owner;

    private User $admin;

    private User $supervisor;

    private User $agent;

    private User $otherAgent;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = $this->makeCompany('FAC-CMT001');
        $this->owner = $this->makeMember($this->company, 'owner');
        $this->admin = $this->makeMember($this->company, 'admin');
        $this->supervisor = $this->makeMember($this->company, 'supervisor');
        $this->agent = $this->makeMember($this->company, 'agent', ['supervisor_user_id' => $this->supervisor->id]);
        $this->otherAgent = $this->makeMember($this->company, 'agent');
    }

    // ── Assignment scenarios ─────────────────────────────────────────────

    public function test_admin_to_supervisor_supervisor_comments_and_admin_responds(): void
    {
        $task = $this->makeTask($this->admin, [$this->supervisor]);

        $this->postComment($this->supervisor, $task, 'Started on this, need the client contact.')
            ->assertCreated()
            ->assertJsonPath('data.comment.body', 'Started on this, need the client contact.')
            ->assertJsonPath('data.comment.author.id', $this->supervisor->id)
            ->assertJsonPath('data.comment.author.role', 'supervisor')
            ->assertJsonPath('data.comment.is_mine', true);

        $this->postComment($this->admin, $task, 'Sent it to your email.')
            ->assertCreated()
            ->assertJsonPath('data.comment.author.role', 'admin');

        $this->getComments($this->supervisor, $task)
            ->assertOk()
            ->assertJsonPath('data.can_comment', true)
            ->assertJsonCount(2, 'data.items')
            ->assertJsonPath('data.items.0.body', 'Started on this, need the client contact.')
            ->assertJsonPath('data.items.0.is_mine', true)
            ->assertJsonPath('data.items.1.body', 'Sent it to your email.')
            ->assertJsonPath('data.items.1.is_mine', false);
    }

    public function test_admin_to_agent_agent_comments_and_admin_responds(): void
    {
        $task = $this->makeTask($this->admin, [$this->agent]);

        $this->postComment($this->agent, $task, 'Shop was closed on arrival.')->assertCreated();
        $this->postComment($this->admin, $task, 'Please retry tomorrow morning.')->assertCreated();

        $this->getComments($this->admin, $task)
            ->assertOk()
            ->assertJsonCount(2, 'data.items')
            ->assertJsonPath('data.items.0.author.id', $this->agent->id)
            ->assertJsonPath('data.items.0.author.role', 'agent')
            ->assertJsonPath('data.items.1.author.id', $this->admin->id);
    }

    public function test_supervisor_to_agent_agent_comments_and_supervisor_responds(): void
    {
        $task = $this->makeTask($this->supervisor, [$this->agent]);

        $this->postComment($this->agent, $task, 'Done with the first visit.')->assertCreated();
        $this->postComment($this->supervisor, $task, 'Great, log the second one too.')->assertCreated();

        $this->getComments($this->agent, $task)
            ->assertOk()
            ->assertJsonPath('data.can_comment', true)
            ->assertJsonCount(2, 'data.items');
    }

    public function test_user_who_made_current_assignment_can_respond_even_if_not_creator(): void
    {
        $task = $this->makeTask($this->admin, [$this->agent], assignedBy: $this->supervisor);

        $this->postComment($this->supervisor, $task, 'Following up as assigner.')->assertCreated();
    }

    public function test_all_current_assignees_share_one_thread(): void
    {
        $task = $this->makeTask($this->admin, [$this->agent, $this->otherAgent]);

        $this->postComment($this->agent, $task, 'From agent one.')->assertCreated();
        $this->postComment($this->otherAgent, $task, 'From agent two.')->assertCreated();

        $this->getComments($this->agent, $task)
            ->assertOk()
            ->assertJsonCount(2, 'data.items');
    }

    // ── Persistence & ordering ───────────────────────────────────────────

    public function test_comments_are_stored_against_the_correct_task_and_author(): void
    {
        $task = $this->makeTask($this->admin, [$this->agent]);
        $otherTask = $this->makeTask($this->admin, [$this->agent]);

        $this->postComment($this->agent, $task, 'Only on the first task.')->assertCreated();

        $this->assertDatabaseHas('task_comments', [
            'task_id' => $task->id,
            'company_id' => $this->company->id,
            'author_user_id' => $this->agent->id,
            'body' => 'Only on the first task.',
        ]);

        $this->getComments($this->agent, $otherTask)
            ->assertOk()
            ->assertJsonCount(0, 'data.items');
    }

    public function test_comments_are_returned_oldest_first(): void
    {
        $task = $this->makeTask($this->admin, [$this->agent]);

        foreach (['third' => 3, 'first' => 1, 'second' => 2] as $body => $minutesAgo) {
            TaskComment::create([
                'company_id' => $this->company->id,
                'task_id' => $task->id,
                'author_user_id' => $this->agent->id,
                'body' => $body,
            ])->forceFill(['created_at' => now()->subMinutes(10 - $minutesAgo)])->save();
        }

        $this->getComments($this->admin, $task)
            ->assertOk()
            ->assertJsonPath('data.items.0.body', 'first')
            ->assertJsonPath('data.items.1.body', 'second')
            ->assertJsonPath('data.items.2.body', 'third');
    }

    // ── Authorization ────────────────────────────────────────────────────

    public function test_unauthenticated_requests_are_rejected(): void
    {
        $task = $this->makeTask($this->admin, [$this->agent]);

        $this->getJson("/api/v1/tasks/{$task->id}/comments")->assertUnauthorized();
        $this->postJson("/api/v1/tasks/{$task->id}/comments", ['body' => 'Hi'])->assertUnauthorized();

        $this->assertDatabaseCount('task_comments', 0);
    }

    public function test_unrelated_agent_cannot_read_or_post_comments(): void
    {
        $task = $this->makeTask($this->admin, [$this->agent]);
        $this->postComment($this->agent, $task, 'Private feedback.')->assertCreated();

        $this->getComments($this->otherAgent, $task)->assertForbidden();
        $this->postComment($this->otherAgent, $task, 'Sneaky comment.')->assertForbidden();

        $this->assertDatabaseMissing('task_comments', ['body' => 'Sneaky comment.']);
    }

    public function test_previously_assigned_agent_loses_comment_access_after_reassignment(): void
    {
        $task = $this->makeTask($this->admin, [$this->otherAgent]);
        TaskAssignment::query()->where('task_id', $task->id)->update(['is_current' => false, 'unassigned_at' => now()]);
        $task->update(['assigned_agent_id' => $this->agent->id]);
        $this->assign($task, $this->agent, $this->admin);

        $this->getComments($this->otherAgent, $task)->assertForbidden();
        $this->postComment($this->otherAgent, $task, 'No longer mine.')->assertForbidden();
        $this->postComment($this->agent, $task, 'New owner here.')->assertCreated();
    }

    public function test_uninvolved_supervisor_can_read_but_not_post(): void
    {
        $otherSupervisor = $this->makeMember($this->company, 'supervisor');
        $task = $this->makeTask($this->admin, [$this->agent]);

        $this->getComments($otherSupervisor, $task)
            ->assertOk()
            ->assertJsonPath('data.can_comment', false);

        $this->postComment($otherSupervisor, $task, 'Drive-by comment.')->assertForbidden();
    }

    public function test_uninvolved_owner_and_admin_can_post_for_oversight(): void
    {
        $otherAdmin = $this->makeMember($this->company, 'admin');
        $task = $this->makeTask($this->supervisor, [$this->agent]);

        $this->postComment($this->owner, $task, 'Owner checking in.')->assertCreated();
        $this->postComment($otherAdmin, $task, 'Admin checking in.')->assertCreated();
        $this->getComments($otherAdmin, $task)->assertOk()->assertJsonPath('data.can_comment', true);
    }

    public function test_user_from_another_company_cannot_access_comments(): void
    {
        $task = $this->makeTask($this->admin, [$this->agent]);

        $otherCompany = $this->makeCompany('FAC-CMT002');
        $outsider = $this->makeMember($otherCompany, 'owner');

        // Without company context: the user is not a member of the task's company.
        $this->getComments($outsider, $task)->assertStatus(422);
        $this->postComment($outsider, $task, 'Cross tenant.')->assertStatus(422);

        // With their own company context: the task is not visible in that tenant.
        $this->withToken($this->tokenFor($outsider))
            ->getJson("/api/v1/tasks/{$task->id}/comments?company_id={$otherCompany->id}")
            ->assertNotFound();
        $this->withToken($this->tokenFor($outsider))
            ->postJson("/api/v1/tasks/{$task->id}/comments", ['body' => 'Cross tenant.', 'company_id' => $otherCompany->id])
            ->assertNotFound();

        $this->assertDatabaseCount('task_comments', 0);
    }

    public function test_author_cannot_be_impersonated(): void
    {
        $task = $this->makeTask($this->admin, [$this->agent]);

        $this->withToken($this->tokenFor($this->agent))
            ->postJson("/api/v1/tasks/{$task->id}/comments", [
                'body' => 'Pretending to be the admin.',
                'author_user_id' => $this->admin->id,
                'author_id' => $this->admin->id,
                'task_id' => 999999,
            ])
            ->assertCreated()
            ->assertJsonPath('data.comment.author.id', $this->agent->id)
            ->assertJsonPath('data.comment.task_id', $task->id);

        $this->assertDatabaseHas('task_comments', ['author_user_id' => $this->agent->id, 'task_id' => $task->id]);
        $this->assertDatabaseMissing('task_comments', ['author_user_id' => $this->admin->id]);
    }

    // ── Validation ───────────────────────────────────────────────────────

    public function test_empty_and_whitespace_only_comments_are_rejected(): void
    {
        $task = $this->makeTask($this->admin, [$this->agent]);

        foreach (['', '   ', "\n\t  \n", "\u{00A0}\u{200B} "] as $body) {
            $this->postComment($this->agent, $task, $body)
                ->assertUnprocessable()
                ->assertJsonPath('errors.body.0', 'Comment cannot be empty.');
        }

        $this->withToken($this->tokenFor($this->agent))
            ->postJson("/api/v1/tasks/{$task->id}/comments", [])
            ->assertUnprocessable();

        $this->assertDatabaseCount('task_comments', 0);
    }

    public function test_overlong_and_non_string_comments_are_rejected(): void
    {
        $task = $this->makeTask($this->admin, [$this->agent]);

        $this->postComment($this->agent, $task, str_repeat('a', 2001))->assertUnprocessable();
        $this->withToken($this->tokenFor($this->agent))
            ->postJson("/api/v1/tasks/{$task->id}/comments", ['body' => ['nested' => 'x']])
            ->assertUnprocessable();

        $this->assertDatabaseCount('task_comments', 0);
    }

    public function test_comment_body_is_trimmed_and_stored_as_plain_text(): void
    {
        $task = $this->makeTask($this->admin, [$this->agent]);

        $this->postComment($this->agent, $task, "  <b>Line one</b>\nLine two  ")
            ->assertCreated()
            ->assertJsonPath('data.comment.body', "<b>Line one</b>\nLine two");
    }

    public function test_invalid_task_id_returns_not_found(): void
    {
        $this->getComments($this->agent, 999999)->assertNotFound();
        $this->postComment($this->agent, 999999, 'Hello')->assertNotFound();
    }

    // ── Route coverage & failure handling ────────────────────────────────

    public function test_agent_and_admin_scoped_routes_work(): void
    {
        $task = $this->makeTask($this->admin, [$this->agent]);

        $this->withToken($this->tokenFor($this->agent))
            ->postJson("/api/v1/agent/tasks/{$task->id}/comments", ['body' => 'From the PWA.'])
            ->assertCreated();

        $this->withToken($this->tokenFor($this->admin))
            ->postJson("/api/v1/admin/tasks/{$task->id}/comments", ['body' => 'From the admin portal.'])
            ->assertCreated();

        $this->withToken($this->tokenFor($this->agent))
            ->getJson("/api/v1/agent/tasks/{$task->id}/comments")
            ->assertOk()
            ->assertJsonCount(2, 'data.items');

        // Agents are kept out of management endpoints by the existing role middleware.
        $this->withToken($this->tokenFor($this->agent))
            ->getJson("/api/v1/admin/tasks/{$task->id}/comments")
            ->assertForbidden();
    }

    public function test_database_failure_returns_server_error(): void
    {
        $task = $this->makeTask($this->admin, [$this->agent]);

        Schema::drop('task_comments');

        $this->postComment($this->agent, $task, 'This will fail to save.')
            ->assertStatus(500)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Unable to save your comment right now. Please try again.');
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private function getComments(User $user, Task|int $task)
    {
        $id = $task instanceof Task ? $task->id : $task;

        return $this->withToken($this->tokenFor($user))->getJson("/api/v1/tasks/{$id}/comments");
    }

    private function postComment(User $user, Task|int $task, string $body)
    {
        $id = $task instanceof Task ? $task->id : $task;

        return $this->withToken($this->tokenFor($user))->postJson("/api/v1/tasks/{$id}/comments", ['body' => $body]);
    }

    private function tokenFor(User $user): string
    {
        // Each request in these tests acts as a different user; drop the cached guard user.
        $this->app['auth']->forgetGuards();

        return $user->createToken('test-token', ['*'])->plainTextToken;
    }

    /**
     * @param  array<int, User>  $assignees
     */
    private function makeTask(User $creator, array $assignees, ?User $assignedBy = null): Task
    {
        $task = Task::create([
            'company_id' => $this->company->id,
            'created_by_user_id' => $creator->id,
            'assigned_agent_id' => $assignees[0]->id ?? null,
            'title' => 'Comment test task',
            'type' => 'inspection',
            'description' => 'Visit the site and record findings.',
            'status' => 'pending',
        ]);

        foreach ($assignees as $assignee) {
            $this->assign($task, $assignee, $assignedBy ?? $creator);
        }

        return $task;
    }

    private function assign(Task $task, User $assignee, User $assignedBy): void
    {
        TaskAssignment::create([
            'task_id' => $task->id,
            'assigned_by_user_id' => $assignedBy->id,
            'assigned_agent_id' => $assignee->id,
            'assigned_at' => now(),
            'is_current' => true,
        ]);
    }

    private function makeCompany(string $code): Company
    {
        return Company::create([
            'company_id' => $code,
            'name' => 'Comment Co '.$code,
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
