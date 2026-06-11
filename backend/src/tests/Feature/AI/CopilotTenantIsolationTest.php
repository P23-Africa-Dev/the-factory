<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CopilotTenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    public function test_copilot_rejects_access_to_unrelated_company_context(): void
    {
        $primaryCompany = Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'Factory ' . Str::upper(Str::random(4)),
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Operations management',
            'status' => 'active',
            'activated_at' => now(),
        ]);
        $otherCompany = Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'Factory ' . Str::upper(Str::random(4)),
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Operations management',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        /** @var User $admin */
        $admin = User::factory()->createOne();

        $primaryCompany->users()->attach($admin->id, [
            'role' => 'admin',
            'joined_at' => now(),
        ]);

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $otherCompany->id,
                'message' => 'Show overdue tasks',
            ]);

        $response
            ->assertStatus(422)
            ->assertJsonValidationErrors(['company_id']);
    }
}
