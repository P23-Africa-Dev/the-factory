<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CopilotRuntimePolicyFlagsTest extends TestCase
{
    use RefreshDatabase;

    public function test_actions_are_blocked_when_ai_enable_actions_is_false(): void
    {
        config()->set('services.ai.enable_actions', false);

        [$company, $admin] = $this->seedUserWithRole('admin');

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'create task for compliance audit',
                'action_args' => [
                    'title' => 'Compliance audit',
                    'type' => 'inspection',
                    'description' => 'Create compliance checklist',
                    'location' => 'HQ',
                    'address' => '15 Marina Road, Lagos',
                    'due_date' => now()->addDay()->toIso8601String(),
                ],
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.payload.actions_disabled', true);
    }

    public function test_monthly_credit_limit_blocks_additional_requests(): void
    {
        config()->set('services.ai.monthly_org_credit_limit', 1);

        [$company, $admin] = $this->seedUserWithRole('admin');

        $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'show overdue tasks',
            ])
            ->assertOk();

        $blocked = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'show overdue tasks again',
            ]);

        $blocked
            ->assertOk()
            ->assertJsonPath('data.response.payload.limit_exceeded', true)
            ->assertJsonPath('data.response.sources.0', 'policy.credit_limit');
    }

    public function test_streaming_flag_can_force_json_response_when_stream_requested(): void
    {
        config()->set('services.ai.enable_streaming', false);

        [$company, $admin] = $this->seedUserWithRole('admin');

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'show overdue tasks',
                'stream' => true,
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.thread_id', $response->json('data.thread_id'));
    }

    public function test_pii_redaction_masks_email_in_stored_user_prompt(): void
    {
        config()->set('services.ai.pii_redaction_enabled', true);

        [$company, $admin] = $this->seedUserWithRole('admin');

        $message = 'My email is john.doe@example.com. what is my name?';

        $chat = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => $message,
            ]);

        $chat->assertOk();

        $threadId = (string) $chat->json('data.thread_id');

        $thread = $this
            ->actingAs($admin)
            ->getJson('/api/v1/copilot/threads/' . $threadId . '?company_id=' . $company->id);

        $thread->assertOk();

        $storedPrompt = (string) ($thread->json('data.thread.messages.0.content') ?? '');

        $this->assertStringContainsString('[redacted-email]', $storedPrompt);
        $this->assertStringNotContainsString('john.doe@example.com', $storedPrompt);
    }

    /**
     * @return array{0: Company, 1: User}
     */
    private function seedUserWithRole(string $role): array
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
        $user = User::factory()->createOne();

        $company->users()->attach($user->id, [
            'role' => $role,
            'joined_at' => now(),
        ]);

        return [$company, $user];
    }
}
