<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CopilotDateTimeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.ai.enable_read_synthesis' => false,
            'services.ai.enable_hybrid_router' => false,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_general_chat_returns_local_date_for_timezone_question(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-10 10:15:00', 'UTC'));

        [$company, $admin] = $this->seedCompanyAdmin();

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'What day is it today?',
                'client_timezone' => 'Africa/Lagos',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.intent.type', 'general');

        $content = (string) $response->json('data.response.content');
        $this->assertStringContainsString('Today is Friday, July 10, 2026.', $content);
        $this->assertStringContainsString('The current local time is 11:15 AM (Africa/Lagos).', $content);
        $this->assertStringNotContainsString('June 14, 2024', $content);
    }

    public function test_general_chat_falls_back_to_company_country_timezone(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-10 09:00:00', 'UTC'));

        [$company, $admin] = $this->seedCompanyAdmin();

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'What time is it?',
            ]);

        $response->assertOk();

        $content = (string) $response->json('data.response.content');
        $this->assertStringContainsString('Today is Friday, July 10, 2026.', $content);
        $this->assertStringContainsString('The current local time is 10:00 AM (Africa/Lagos).', $content);
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
        $admin = User::factory()->createOne([
            'is_active' => true,
        ]);

        $company->users()->attach($admin->id, [
            'role' => 'admin',
            'joined_at' => now(),
        ]);

        return [$company, $admin];
    }
}
