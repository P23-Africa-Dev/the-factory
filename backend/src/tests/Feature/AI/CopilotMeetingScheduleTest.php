<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Models\Company;
use App\Models\User;
use App\Services\AI\Providers\AiProviderRouter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Mockery;
use Tests\TestCase;

final class CopilotMeetingScheduleTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_meeting_schedule_confirmation_includes_attendees_reminders_and_timezone(): void
    {
        [$company, $admin, $david] = $this->seedCompanyAdminWithMember();

        $elijah = \App\Models\User::factory()->createOne(['name' => 'Elijah Test', 'email' => 'elijah@factory23.test']);
        $company->users()->attach($elijah->id, ['role' => 'agent']);

        $mockRouter = Mockery::mock(AiProviderRouter::class);
        $mockRouter->shouldReceive('generateText')->once()->andReturn(null);
        $this->app->instance(AiProviderRouter::class, $mockRouter);

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'client_timezone' => 'America/New_York',
                'message' => 'Create me a meeting with Agent Elijah and Matter',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.payload.confirmation_required', true)
            ->assertJsonPath('data.response.payload.tool', 'meetings.schedule');

        $actionArgs = $response->json('data.response.payload.action_args');
        $this->assertIsArray($actionArgs);
        $this->assertNotEmpty($actionArgs['title']);
        $this->assertNotSame($actionArgs['title'], $actionArgs['description']);
        $this->assertSame('America/New_York', $actionArgs['timezone']);
        $this->assertIsArray($actionArgs['attendees']);
        $this->assertNotEmpty($actionArgs['attendees']);
        $this->assertIsArray($actionArgs['reminders']);
        $this->assertNotEmpty($actionArgs['reminders']);
        $this->assertStringContainsString('ELY prepared a meeting', (string) $response->json('data.response.content'));
    }

    public function test_meeting_schedule_confirmation_for_project_review_prompt(): void
    {
        [$company, $admin, $david] = $this->seedCompanyAdminWithMember();

        $mockRouter = Mockery::mock(AiProviderRouter::class);
        $mockRouter->shouldReceive('generateText')->once()->andReturn(null);
        $this->app->instance(AiProviderRouter::class, $mockRouter);

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'client_timezone' => 'America/New_York',
                'message' => 'Schedule a project review meeting with David tomorrow at 2 PM.',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.payload.confirmation_required', true)
            ->assertJsonPath('data.response.payload.tool', 'meetings.schedule');

        $actionArgs = $response->json('data.response.payload.action_args');
        $this->assertIsArray($actionArgs);
        $this->assertSame('Project Review Meeting', $actionArgs['title']);
        $this->assertNotSame($actionArgs['title'], $actionArgs['description']);
        $this->assertSame('America/New_York', $actionArgs['timezone']);
        $this->assertIsArray($actionArgs['attendees']);
        $this->assertNotEmpty($actionArgs['attendees']);
        $this->assertIsArray($actionArgs['reminders']);
        $this->assertNotEmpty($actionArgs['reminders']);
        $this->assertStringContainsString('ELY prepared a meeting', (string) $response->json('data.response.content'));
    }

    /**
     * @return array{0: Company, 1: User, 2: User}
     */
    private function seedCompanyAdminWithMember(): array
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

        $admin = User::factory()->createOne();
        $david = User::factory()->createOne(['name' => 'David Test', 'email' => 'david@factory23.test']);

        $company->users()->attach($admin->id, ['role' => 'admin']);
        $company->users()->attach($david->id, ['role' => 'agent']);

        return [$company, $admin, $david];
    }
}
