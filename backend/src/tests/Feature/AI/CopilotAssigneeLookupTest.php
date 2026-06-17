<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CopilotAssigneeLookupTest extends TestCase
{
    use RefreshDatabase;

    public function test_assignee_lookup_returns_company_scoped_matches(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');
        $elijah = $this->createCompanyUser($company, 'Elijah Stone', 'agent', 'elijah.stone@example.com');
        $this->createCompanyUser($company, 'Amina Cole', 'agent', 'amina.cole@example.com');

        [$otherCompany] = $this->seedCompanyUser('admin');
        $external = $this->createCompanyUser($otherCompany, 'Elijah External', 'agent', 'elijah.external@example.com');

        $response = $this
            ->actingAs($admin)
            ->getJson('/api/v1/copilot/assignees?company_id=' . $company->id . '&query=eli&limit=10');

        $response
            ->assertOk()
            ->assertJsonPath('message', 'Copilot assignees fetched successfully.');

        /** @var array<int,array<string,mixed>> $items */
        $items = $response->json('data.items', []);

        $this->assertIsArray($items);
        $collection = collect($items);

        $this->assertTrue($collection->contains(fn(array $item): bool => (int) ($item['id'] ?? 0) === (int) $elijah->id));
        $this->assertFalse($collection->contains(fn(array $item): bool => (int) ($item['id'] ?? 0) === (int) $external->id));
    }

    public function test_assignee_lookup_respects_limit_cap(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');

        foreach (['Ayan', 'Bola', 'Chinedu', 'Dara', 'Efe'] as $name) {
            $this->createCompanyUser($company, $name . ' Agent', 'agent', Str::slug($name, '.') . '.agent@example.com');
        }

        $response = $this
            ->actingAs($admin)
            ->getJson('/api/v1/copilot/assignees?company_id=' . $company->id . '&limit=2');

        $response->assertOk();

        /** @var array<int,array<string,mixed>> $items */
        $items = $response->json('data.items', []);

        $this->assertIsArray($items);
        $this->assertLessThanOrEqual(2, count($items));
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
        $user = User::factory()->createOne();

        $company->users()->attach($user->id, [
            'role' => $role,
            'joined_at' => now(),
        ]);

        return [$company, $user];
    }

    private function createCompanyUser(Company $company, string $name, string $role, string $email): User
    {
        /** @var User $user */
        $user = User::factory()->createOne([
            'name' => $name,
            'email' => $email,
        ]);

        $company->users()->attach($user->id, [
            'role' => $role,
            'joined_at' => now(),
        ]);

        return $user;
    }
}
