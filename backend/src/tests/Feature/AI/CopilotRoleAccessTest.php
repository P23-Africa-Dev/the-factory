<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CopilotRoleAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_agent_receives_policy_denial_for_tracking_tool(): void
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
        /** @var User $agent */
        $agent = User::factory()->createOne([
            'company_id' => $company->id,
            'role' => 'agent',
        ]);

        $company->users()->attach($agent->id, [
            'role' => 'agent',
            'joined_at' => now(),
        ]);

        $response = $this
            ->actingAs($agent)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Which agents are active right now?',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('message.role', 'assistant')
            ->assertJsonPath('message.sources.0', 'tracking.active_agents');

        $content = (string) $response->json('message.content');

        $this->assertStringContainsString('do not have permission', strtolower($content));
    }
}
