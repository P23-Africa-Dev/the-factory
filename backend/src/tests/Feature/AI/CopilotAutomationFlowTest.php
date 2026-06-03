<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Jobs\ExecuteAutomationRuleJob;
use App\Models\AiAutomationRule;
use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CopilotAutomationFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_preview_and_create_automation_rule(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');

        $preview = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/automations/preview', [
                'company_id' => $company->id,
                'prompt' => 'Create task every week for safety checklist',
            ]);

        $preview
            ->assertOk()
            ->assertJsonPath('data.action_tool', 'tasks.create')
            ->assertJsonPath('data.trigger_type', 'schedule.weekly');

        $create = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/automations', [
                'company_id' => $company->id,
                'name' => 'Weekly Safety Checklist',
                'prompt' => 'Create task every week for safety checklist',
            ]);

        $create
            ->assertStatus(201)
            ->assertJsonPath('data.automation.name', 'Weekly Safety Checklist')
            ->assertJsonPath('data.automation.action_tool', 'tasks.create');

        $this->assertDatabaseHas('ai_automation_rules', [
            'company_id' => $company->id,
            'name' => 'Weekly Safety Checklist',
            'action_tool' => 'tasks.create',
        ]);
    }

    public function test_agent_cannot_create_management_only_automation_action(): void
    {
        [$company, $agent] = $this->seedCompanyUser('agent');

        $response = $this
            ->actingAs($agent)
            ->postJson('/api/v1/copilot/automations', [
                'company_id' => $company->id,
                'prompt' => 'Create task every week for safety checklist',
            ]);

        $response
            ->assertStatus(422)
            ->assertJsonValidationErrors(['action_tool']);
    }

    public function test_automation_run_is_scoped_to_active_company(): void
    {
        Queue::fake();

        [$companyA, $adminA] = $this->seedCompanyUser('admin');
        [$companyB, $adminB] = $this->seedCompanyUser('admin');

        $rule = AiAutomationRule::query()->create([
            'company_id' => $companyA->id,
            'created_by_user_id' => $adminA->id,
            'name' => 'Rule A',
            'prompt' => 'send notification daily',
            'trigger_type' => 'schedule.daily',
            'trigger_expression' => 'daily:09:00',
            'action_tool' => 'notifications.send',
            'action_args' => [
                'title' => 'Daily Check',
                'message' => 'Automated check in.',
                'roles' => ['admin'],
            ],
            'status' => 'active',
        ]);

        $response = $this
            ->actingAs($adminB)
            ->postJson('/api/v1/copilot/automations/' . $rule->id . '/run', [
                'company_id' => $companyB->id,
            ]);

        $response
            ->assertStatus(422)
            ->assertJsonValidationErrors(['automation']);

        Queue::assertNothingPushed();
    }

    public function test_automation_run_dispatches_queue_job_for_valid_scope(): void
    {
        Queue::fake();

        [$company, $admin] = $this->seedCompanyUser('admin');

        $rule = AiAutomationRule::query()->create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'name' => 'Rule Run',
            'prompt' => 'send notification daily',
            'trigger_type' => 'schedule.daily',
            'trigger_expression' => 'daily:09:00',
            'action_tool' => 'notifications.send',
            'action_args' => [
                'title' => 'Daily Check',
                'message' => 'Automated check in.',
                'roles' => ['admin'],
            ],
            'status' => 'active',
        ]);

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/automations/' . $rule->id . '/run', [
                'company_id' => $company->id,
            ]);

        $response->assertStatus(202)->assertJsonPath('data.queued', true);

        Queue::assertPushed(ExecuteAutomationRuleJob::class);
    }

    public function test_preview_accepts_structured_field_map_for_task_creation(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/automations/preview', [
                'company_id' => $company->id,
                'prompt' => 'tool: tasks.create; title: Safety Walkthrough; type: inspection; description: Run safety walkthrough; location: Yard A; address: Main Yard; due_date: 2026-06-10T09:00:00Z',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.action_tool', 'tasks.create')
            ->assertJsonPath('data.action_args.title', 'Safety Walkthrough')
            ->assertJsonPath('data.action_args.location', 'Yard A');
    }

    public function test_preview_rejects_invalid_structured_payload_for_reassign_tool(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/automations/preview', [
                'company_id' => $company->id,
                'prompt' => 'tool: tasks.reassign; note: move this quickly',
            ]);

        $response
            ->assertStatus(422)
            ->assertJsonValidationErrors(['action_args.task_id', 'action_args.assignee_id']);
    }

    /**
     * @return array{0: Company, 1: User}
     */
    private function seedCompanyUser(string $role): array
    {
        $company = Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'Factory ' . Str::upper(Str::random(4)),
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Operations management',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        /** @var User $user */
        $user = User::factory()->createOne([
            'company_id' => $company->id,
            'role' => $role,
        ]);

        $company->users()->attach($user->id, [
            'role' => $role,
            'joined_at' => now(),
        ]);

        return [$company, $user];
    }
}
