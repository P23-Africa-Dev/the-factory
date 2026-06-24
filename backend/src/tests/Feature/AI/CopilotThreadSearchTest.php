<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Models\Company;
use App\Models\User;
use App\Services\AI\Context\ConversationMemoryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CopilotThreadSearchTest extends TestCase
{
    use RefreshDatabase;

    public function test_thread_search_returns_matching_conversations(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');
        $memory = app(ConversationMemoryService::class);

        $thread = $memory->appendMessage((int) $company->id, (int) $admin->id, null, 'user', 'Schedule a meeting about payroll');
        $memory->appendMessage((int) $company->id, (int) $admin->id, $thread['thread_id'], 'assistant', 'I can help schedule that meeting.');
        $memory->appendMessage((int) $company->id, (int) $admin->id, $thread['thread_id'], 'user', 'Create a task for field inspection');

        $response = $this
            ->actingAs($admin)
            ->getJson('/api/v1/copilot/threads/search?' . http_build_query([
                'company_id' => $company->id,
                'q' => 'meeting',
            ]));

        $response
            ->assertOk()
            ->assertJsonPath('data.items.0.thread_id', $thread['thread_id'])
            ->assertJsonPath('data.items.0.title', 'Schedule a meeting about payroll');
    }

    public function test_thread_search_is_scoped_to_active_company(): void
    {
        [$companyA, $admin] = $this->seedCompanyUser('admin');
        [$companyB] = $this->seedCompanyOnly();

        $memory = app(ConversationMemoryService::class);
        $memory->appendMessage((int) $companyA->id, (int) $admin->id, null, 'user', 'meeting in company A');
        $memory->appendMessage((int) $companyB->id, (int) $admin->id, null, 'user', 'meeting in company B');

        $response = $this
            ->actingAs($admin)
            ->getJson('/api/v1/copilot/threads/search?' . http_build_query([
                'company_id' => $companyA->id,
                'q' => 'meeting',
            ]));

        $response
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.title', 'meeting in company A');
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
            'is_active' => true,
        ]);

        $company->users()->attach($user->id, [
            'role' => $role,
            'joined_at' => now(),
        ]);

        return [$company, $user];
    }

    private function seedCompanyOnly(): array
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

        return [$company];
    }
}
