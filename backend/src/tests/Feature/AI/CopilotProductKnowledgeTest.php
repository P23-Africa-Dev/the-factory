<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CopilotProductKnowledgeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.ai.enable_read_synthesis' => false,
            'services.ai.enable_hybrid_router' => false,
            'services.ai.pii_redaction_enabled' => false,
        ]);
    }

    public function test_what_is_factory23_returns_curated_product_overview(): void
    {
        [$company, $admin] = $this->seedCompanyAdmin();

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'What is Factory23?',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.intent.type', 'general');

        $content = (string) $response->json('data.response.content');
        $this->assertStringContainsString('field workforce management and CRM platform', $content);
        $this->assertStringContainsString('live GPS tracking', $content);
        $this->assertStringContainsString('Company Drive', $content);
    }

    public function test_what_does_this_software_do_returns_product_overview(): void
    {
        [$company, $admin] = $this->seedCompanyAdmin();

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'What does this software do?',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.intent.type', 'general');

        $content = (string) $response->json('data.response.content');
        $this->assertStringContainsString('Factory23', $content);
        $this->assertStringContainsString('CRM', $content);
    }

    /**
     * @return array{0: Company, 1: User}
     */
    private function seedCompanyAdmin(): array
    {
        $company = Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'Shelby Global Ent.',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Operations management',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $admin = User::factory()->createOne(['is_active' => true]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $admin->id,
            'role' => 'admin',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [$company, $admin];
    }
}
