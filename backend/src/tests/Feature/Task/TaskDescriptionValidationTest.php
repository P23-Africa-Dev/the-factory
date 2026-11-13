<?php

declare(strict_types=1);

namespace Tests\Feature\Task;

use App\Models\Company;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class TaskDescriptionValidationTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private User $admin;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        Notification::fake();

        $this->company = Company::create([
            'company_id' => 'FAC-DESC001',
            'name' => 'Description Co',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Field operations',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $this->admin = $this->makeMember('admin');
        $this->agent = $this->makeMember('agent');
    }

    public function test_task_creation_succeeds_with_valid_description(): void
    {
        $this->createAsAdmin(['description' => 'Visit the site and record findings.'])
            ->assertCreated()
            ->assertJsonPath('data.task.description', 'Visit the site and record findings.');

        $this->createSelfAsAgent(['description' => 'Check stock levels at the store.'])
            ->assertCreated()
            ->assertJsonPath('data.task.description', 'Check stock levels at the store.');
    }

    public function test_task_creation_succeeds_without_description(): void
    {
        $this->createAsAdmin([])
            ->assertCreated()
            ->assertJsonPath('data.task.description', null);

        $this->createSelfAsAgent([])
            ->assertCreated()
            ->assertJsonPath('data.task.description', null);

        $this->assertSame(2, Task::query()->count());
    }

    public function test_task_creation_accepts_empty_null_or_whitespace_description(): void
    {
        foreach (['', null, '   ', "\n\t \n"] as $description) {
            $this->createAsAdmin(['description' => $description])
                ->assertCreated()
                ->assertJsonPath('data.task.description', null);

            $this->createSelfAsAgent(['description' => $description])
                ->assertCreated()
                ->assertJsonPath('data.task.description', null);
        }
    }

    public function test_task_creation_accepts_short_description(): void
    {
        $this->createAsAdmin(['description' => 'Go'])
            ->assertCreated()
            ->assertJsonPath('data.task.description', 'Go');
    }

    public function test_task_creation_rejects_description_over_max_length(): void
    {
        $this->createAsAdmin(['description' => str_repeat('a', 5001)])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['description']);
    }

    public function test_update_can_clear_or_omit_description(): void
    {
        $task = Task::create([
            'company_id' => $this->company->id,
            'created_by_user_id' => $this->admin->id,
            'title' => 'Task with description',
            'description' => 'Original description',
            'status' => 'pending',
        ]);

        $this->withToken($this->tokenFor($this->admin))
            ->patchJson("/api/v1/tasks/{$task->id}", [
                'company_id' => $this->company->id,
                'title' => 'Task renamed',
            ])
            ->assertOk()
            ->assertJsonPath('data.task.description', 'Original description');

        $this->withToken($this->tokenFor($this->admin))
            ->patchJson("/api/v1/tasks/{$task->id}", [
                'company_id' => $this->company->id,
                'description' => '   ',
            ])
            ->assertOk()
            ->assertJsonPath('data.task.description', null);

        $this->assertNull($task->fresh()->description);
    }

    private function createAsAdmin(array $overrides)
    {
        return $this->withToken($this->tokenFor($this->admin))
            ->postJson('/api/v1/tasks', array_merge([
                'company_id' => $this->company->id,
                'title' => 'Admin created task',
                'assigned_agent_id' => $this->agent->id,
            ], $overrides));
    }

    private function createSelfAsAgent(array $overrides)
    {
        return $this->withToken($this->tokenFor($this->agent))
            ->postJson('/api/v1/agent/tasks/self', array_merge([
                'company_id' => $this->company->id,
                'title' => 'Agent self task',
            ], $overrides));
    }

    private function tokenFor(User $user): string
    {
        $this->app['auth']->forgetGuards();

        return $user->createToken('test-token', ['*'])->plainTextToken;
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
