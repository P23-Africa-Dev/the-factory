<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Admin;
use App\Models\Company;
use App\Models\User;
use App\Services\AI\AiStackSettingService;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

final class AiStackAdminTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->withoutMiddleware(PreventRequestForgery::class);
        config([
            'services.ai.enable_read_synthesis' => false,
            'services.ai.enable_hybrid_router' => false,
            'services.ai.pii_redaction_enabled' => false,
            'services.ai.stack' => 'openai_claude',
            'services.ai.openai.api_key' => 'sk-openai-test',
            'services.ai.claude.api_key' => 'sk-ant-test',
            'services.ai.nvidia.api_key' => 'nvapi-test',
            'services.ai.nvidia.base_url' => 'https://integrate.api.nvidia.com/v1',
            'services.ai.nvidia.exec_model' => 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
            'services.ai.openai.base_url' => 'https://api.openai.com/v1',
            'services.ai.claude.base_url' => 'https://api.anthropic.com/v1',
        ]);
    }

    public function test_super_admin_can_switch_to_nvidia_stack(): void
    {
        $admin = $this->makeAdmin('super_admin');

        $this->actingAs($admin, 'admin')
            ->post(route('admin.ai.stack.update'), [
                'stack' => AiStackSettingService::NVIDIA,
            ])
            ->assertRedirect(route('admin.ai.index'))
            ->assertSessionHas('status');

        $this->assertDatabaseHas('platform_settings', [
            'key' => 'ai.stack',
            'value' => 'nvidia',
            'updated_by_admin_id' => $admin->id,
        ]);
        $this->assertSame(AiStackSettingService::NVIDIA, app(AiStackSettingService::class)->getStack());
    }

    public function test_non_super_admin_cannot_switch_ai_stack(): void
    {
        $admin = $this->makeAdmin('admin');

        $this->actingAs($admin, 'admin')
            ->post(route('admin.ai.stack.update'), [
                'stack' => AiStackSettingService::NVIDIA,
            ])
            ->assertForbidden();

        $this->assertDatabaseMissing('platform_settings', [
            'key' => 'ai.stack',
            'value' => 'nvidia',
        ]);
    }

    public function test_nvidia_stack_chat_calls_nvidia_only(): void
    {
        $admin = $this->makeAdmin('super_admin');
        app(AiStackSettingService::class)->setStack(AiStackSettingService::NVIDIA, $admin);

        [$company, $user] = $this->seedCompanyUser();

        Http::fake([
            'integrate.api.nvidia.com/*' => Http::response([
                'choices' => [
                    ['message' => ['content' => 'Hello from NVIDIA ELY.']],
                ],
                'model' => 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
                'usage' => ['prompt_tokens' => 10, 'completion_tokens' => 5],
            ], 200),
            'api.openai.com/*' => Http::response(['error' => ['message' => 'should not be called']], 500),
            'api.anthropic.com/*' => Http::response(['error' => ['message' => 'should not be called']], 500),
        ]);

        $response = $this
            ->actingAs($user)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Tell me a short motivational tip for field agents',
            ]);

        $response->assertOk();

        Http::assertSent(fn ($request) => str_contains($request->url(), 'integrate.api.nvidia.com'));
        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'api.openai.com'));
        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'api.anthropic.com'));
    }

    private function makeAdmin(string $role): Admin
    {
        return Admin::create([
            'name' => 'AI Admin ' . $role,
            'email' => $role . '-' . Str::lower(Str::random(6)) . '@example.com',
            'password' => 'StrongPass123!',
            'role' => $role,
            'is_active' => true,
        ]);
    }

    /**
     * @return array{0: Company, 1: User}
     */
    private function seedCompanyUser(): array
    {
        $company = Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'AI Stack Co',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Operations',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $user = User::factory()->createOne(['is_active' => true]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'role' => 'admin',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [$company, $user];
    }
}
