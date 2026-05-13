<?php

declare(strict_types=1);

namespace Tests\Feature\Onboarding;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WorkspaceCreationTest extends TestCase
{
    use RefreshDatabase;

    public function test_verified_user_can_create_workspace(): void
    {
        $user = User::factory()->create([
            'email_verified_at' => now(),
            'onboarding_completed_at' => null,
        ]);

        $token = $user->createToken('test-token', ['*'])->plainTextToken;

        $response = $this->withToken($token)->postJson('/api/v1/onboarding/workspace', [
            'company_name' => 'The Factory Labs',
            'country' => 'NG',
            'team_size' => '2-10',
            'purpose' => 'startup',
            'user_type' => 'founder',
        ]);

        $response->assertStatus(201)
            ->assertJson([
                'success' => true,
                'message' => 'Workspace created successfully. Welcome aboard!',
            ])
            ->assertJsonStructure([
                'data' => ['token', 'token_type', 'workspace', 'user', 'onboarding_completed'],
            ]);

        $this->assertNotEmpty($response->json('data.token'));
        $this->assertSame('Bearer', $response->json('data.token_type'));
        $this->assertTrue($response->json('data.onboarding_completed'));

        $this->assertDatabaseHas('workspaces', [
            'name' => 'The Factory Labs',
            'country' => 'NG',
            'team_size' => '2-10',
        ]);

        $this->assertDatabaseHas('workspace_users', [
            'user_id' => $user->id,
            'role' => 'owner',
        ]);

        $this->assertDatabaseHas('companies', [
            'name' => 'The Factory Labs',
            'country' => 'NG',
            'team_size' => '2-10',
            'status' => 'active',
        ]);

        $companyId = (int) \App\Models\Company::query()
            ->where('name', 'The Factory Labs')
            ->value('id');

        $this->assertDatabaseHas('company_users', [
            'company_id' => $companyId,
            'user_id' => $user->id,
            'role' => 'owner',
        ]);

        $this->assertNotNull($user->fresh()->onboarding_completed_at);
    }

    public function test_unauthenticated_user_cannot_create_workspace(): void
    {
        $response = $this->postJson('/api/v1/onboarding/workspace', [
            'company_name' => 'The Factory Labs',
            'country' => 'NG',
            'team_size' => '2-10',
            'purpose' => 'startup',
            'user_type' => 'founder',
        ]);

        $response->assertUnauthorized();
    }

    public function test_user_cannot_create_workspace_twice(): void
    {
        $user = User::factory()->create([
            'email_verified_at' => now(),
            'onboarding_completed_at' => now(),
        ]);

        $token = $user->createToken('test-token', ['*'])->plainTextToken;

        $response = $this->withToken($token)->postJson('/api/v1/onboarding/workspace', [
            'company_name' => 'Another Workspace',
            'country' => 'NG',
            'team_size' => '2-10',
            'purpose' => 'startup',
            'user_type' => 'founder',
        ]);

        $response->assertStatus(409)
            ->assertJson(['success' => false]);
    }

    public function test_workspace_creation_fails_with_missing_fields(): void
    {
        $user = User::factory()->create([
            'email_verified_at' => now(),
            'onboarding_completed_at' => null,
        ]);

        $token = $user->createToken('test-token', ['*'])->plainTextToken;

        $response = $this->withToken($token)->postJson('/api/v1/onboarding/workspace', []);

        $response->assertUnprocessable()
            ->assertJsonStructure([
                'errors' => ['company_name', 'country', 'team_size', 'purpose', 'user_type'],
            ]);
    }

    public function test_workspace_creation_fails_with_invalid_team_size(): void
    {
        $user = User::factory()->create([
            'email_verified_at' => now(),
            'onboarding_completed_at' => null,
        ]);

        $token = $user->createToken('test-token', ['*'])->plainTextToken;

        $response = $this->withToken($token)->postJson('/api/v1/onboarding/workspace', [
            'company_name' => 'The Factory Labs',
            'country' => 'NG',
            'team_size' => '1000-2000',
            'purpose' => 'startup',
            'user_type' => 'founder',
        ]);

        $response->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['team_size']]);
    }
}
