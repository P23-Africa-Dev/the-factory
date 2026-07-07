<?php

declare(strict_types=1);

namespace Tests\Feature\Demo;

use App\Enums\SubscriptionStatus;
use App\Models\AttendanceSetting;
use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

final class DemoAiMockTest extends TestCase
{
    use RefreshDatabase;

    public function test_demo_copilot_chat_uses_mock_ai_without_external_provider(): void
    {
        Http::fake();

        config(['services.ai.monthly_org_credit_limit' => 1]);

        [$company, $agent] = $this->seedDemoAgentCompany();

        Cache::put(sprintf('copilot:usage:%d:%s', $company->id, now()->format('Y_m')), 99, now()->endOfMonth());

        $response = $this
            ->actingAs($agent)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Hello ELY, what can you help with?',
            ]);

        $response->assertOk();

        $content = (string) $response->json('data.response.content');
        $this->assertStringContainsStringIgnoringCase('demo', $content);

        Http::assertNothingSent();

        $usage = (int) Cache::get(sprintf('copilot:usage:%d:%s', $company->id, now()->format('Y_m')), 0);
        $this->assertSame(99, $usage);
    }

    public function test_non_demo_company_still_hits_credit_limit(): void
    {
        [$company, $agent] = $this->seedRegularAgentCompany();

        config(['services.ai.monthly_org_credit_limit' => 1]);
        Cache::put(sprintf('copilot:usage:%d:%s', $company->id, now()->format('Y_m')), 1, now()->endOfMonth());

        $response = $this
            ->actingAs($agent)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Summarize today',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.payload.limit_exceeded', true);
    }

    /**
     * @return array{0: Company, 1: User}
     */
    private function seedDemoAgentCompany(): array
    {
        $company = Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'Demo AI Co',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'demo',
            'status' => 'active',
            'activated_at' => now(),
            'is_demo' => true,
            'subscription_status' => SubscriptionStatus::GRACE->value,
            'subscription_grace_ends_at' => '2038-01-01 00:00:00',
        ]);

        $agent = User::factory()->createOne(['internal_role' => 'agent']);
        $company->users()->attach($agent->id, ['role' => 'agent', 'joined_at' => now()]);

        AttendanceSetting::query()->create([
            'company_id' => $company->id,
            'opening_time' => '09:00:00',
            'closing_time' => '17:00:00',
            'working_days' => ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
            'clockin_window_minutes' => 15,
            'auto_clockout_enabled' => true,
        ]);

        return [$company, $agent];
    }

    /**
     * @return array{0: Company, 1: User}
     */
    private function seedRegularAgentCompany(): array
    {
        $company = Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'Regular AI Co',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'operations',
            'status' => 'active',
            'activated_at' => now(),
            'is_demo' => false,
            'subscription_status' => SubscriptionStatus::ACTIVE->value,
        ]);

        $agent = User::factory()->createOne(['internal_role' => 'agent']);
        $company->users()->attach($agent->id, ['role' => 'agent', 'joined_at' => now()]);

        AttendanceSetting::query()->create([
            'company_id' => $company->id,
            'opening_time' => '09:00:00',
            'closing_time' => '17:00:00',
            'working_days' => ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
            'clockin_window_minutes' => 15,
            'auto_clockout_enabled' => true,
        ]);

        return [$company, $agent];
    }
}
