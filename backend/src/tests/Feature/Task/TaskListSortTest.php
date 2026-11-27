<?php

declare(strict_types=1);

namespace Tests\Feature\Task;

use App\Models\Company;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TaskListSortTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create([
            'company_id' => 'FAC-TSORT1',
            'name' => 'Task Sort Co',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Field operations',
            'status' => 'active',
            'activated_at' => now(),
        ]);
        $this->admin = User::factory()->create(['email_verified_at' => now()]);
        DB::table('company_users')->insert([
            'company_id' => $this->company->id,
            'user_id' => $this->admin->id,
            'role' => 'admin',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_task_list_sorts(): void
    {
        $bravo = $this->task('Bravo', 'low', '2026-12-20 09:00:00', '2026-01-01 00:00:00');
        $alpha = $this->task('Alpha', 'high', null, '2026-02-01 00:00:00');
        $charlie = $this->task('Charlie', 'medium', '2026-12-05 09:00:00', '2026-03-01 00:00:00');

        $this->assertSame([$charlie->id, $alpha->id, $bravo->id], $this->ids('newest'));
        $this->assertSame([$bravo->id, $alpha->id, $charlie->id], $this->ids('oldest'));
        $this->assertSame([$charlie->id, $bravo->id, $alpha->id], $this->ids('due_soonest'));
        $this->assertSame([$bravo->id, $charlie->id, $alpha->id], $this->ids('due_latest'));
        $this->assertSame([$alpha->id, $charlie->id, $bravo->id], $this->ids('priority'));
        $this->assertSame([$alpha->id, $bravo->id, $charlie->id], $this->ids('title_asc'));
        $this->assertSame([$charlie->id, $bravo->id, $alpha->id], $this->ids('title_desc'));

        // A comment on the oldest task brings it to the top of "recent activity".
        $this->withToken($this->token())
            ->postJson("/api/v1/tasks/{$bravo->id}/comments", ['body' => 'Any update?'])
            ->assertCreated();
        $this->assertSame($bravo->id, $this->ids('recent_activity')[0]);

        $this->withToken($this->token())
            ->getJson("/api/v1/tasks?company_id={$this->company->id}&sort=bogus")
            ->assertStatus(422);
    }

    public function test_task_list_page_size_is_adjustable_and_capped(): void
    {
        for ($i = 1; $i <= 25; $i++) {
            $this->task("Task {$i}", 'medium', null, '2026-01-01 00:00:00');
        }

        // Default stays 20 for existing callers.
        $this->withToken($this->token())
            ->getJson("/api/v1/tasks?company_id={$this->company->id}")
            ->assertOk()
            ->assertJsonCount(20, 'data.items');

        $this->withToken($this->token())
            ->getJson("/api/v1/tasks?company_id={$this->company->id}&per_page=200")
            ->assertOk()
            ->assertJsonCount(25, 'data.items');

        $this->withToken($this->token())
            ->getJson("/api/v1/tasks?company_id={$this->company->id}&per_page=500")
            ->assertStatus(422);
    }

    /**
     * @return array<int, int>
     */
    private function ids(string $sort): array
    {
        return array_map('intval', array_column(
            $this->withToken($this->token())
                ->getJson("/api/v1/tasks?company_id={$this->company->id}&sort={$sort}")
                ->assertOk()
                ->json('data.items'),
            'id',
        ));
    }

    private function token(): string
    {
        $this->app['auth']->forgetGuards();

        return $this->admin->createToken('test-token', ['*'])->plainTextToken;
    }

    private function task(string $title, string $priority, ?string $dueAt, string $createdAt): Task
    {
        $task = Task::create([
            'company_id' => $this->company->id,
            'created_by_user_id' => $this->admin->id,
            'title' => $title,
            'type' => 'inspection',
            'description' => 'Sort test task.',
            'priority' => $priority,
            'due_at' => $dueAt,
            'status' => 'pending',
        ]);

        DB::table('tasks')->where('id', $task->id)->update([
            'created_at' => $createdAt,
            'updated_at' => $createdAt,
        ]);

        return $task->fresh();
    }
}
