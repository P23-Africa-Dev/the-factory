<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Models\AttendanceRecord;
use App\Models\Company;
use App\Models\CompanyLocation;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CopilotAttendanceAndAnalyticsTest extends TestCase
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

    public function test_attendance_summary_includes_names_for_yesterday(): void
    {
        [$company, $admin, $presentAgent, $lateAgent, $absentAgent] = $this->seedCompanyWithAgents();
        $yesterday = now()->subDay()->toDateString();

        AttendanceRecord::query()->create([
            'company_id' => $company->id,
            'user_id' => $presentAgent->id,
            'attendance_date' => $yesterday,
            'clock_in_at' => $yesterday . ' 08:50:00',
            'clock_out_at' => $yesterday . ' 17:00:00',
            'status' => 'present',
            'work_duration_minutes' => 490,
            'is_late' => false,
            'is_auto_clocked_out' => false,
        ]);

        AttendanceRecord::query()->create([
            'company_id' => $company->id,
            'user_id' => $lateAgent->id,
            'attendance_date' => $yesterday,
            'clock_in_at' => $yesterday . ' 09:40:00',
            'clock_out_at' => $yesterday . ' 17:00:00',
            'status' => 'late',
            'work_duration_minutes' => 440,
            'is_late' => true,
            'is_auto_clocked_out' => false,
        ]);

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'so, how many of my agent was present yesterday?',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'attendance.today_summary')
            ->assertJsonPath('data.response.payload.date', $yesterday);

        $payload = $response->json('data.response.payload');
        $this->assertContains($presentAgent->name, $payload['present_names'] ?? []);
        $this->assertContains($lateAgent->name, $payload['late_names'] ?? []);
        $this->assertContains($absentAgent->name, $payload['absent_names'] ?? []);

        $content = strtolower((string) $response->json('data.response.content'));
        $this->assertStringContainsString(strtolower($presentAgent->name), $content);
        $this->assertStringContainsString(strtolower($lateAgent->name), $content);
        $this->assertStringContainsString(strtolower($absentAgent->name), $content);
    }

    public function test_attendance_can_lookup_named_agent_clock_in(): void
    {
        [$company, $admin, $presentAgent] = $this->seedCompanyWithAgents();
        $yesterday = now()->subDay()->toDateString();

        AttendanceRecord::query()->create([
            'company_id' => $company->id,
            'user_id' => $presentAgent->id,
            'attendance_date' => $yesterday,
            'clock_in_at' => $yesterday . ' 08:55:00',
            'clock_out_at' => $yesterday . ' 17:00:00',
            'status' => 'present',
            'work_duration_minutes' => 485,
            'is_late' => false,
            'is_auto_clocked_out' => false,
        ]);

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'did ' . $presentAgent->name . ' clock in yesterday?',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'attendance.today_summary')
            ->assertJsonPath('data.response.payload.agent_lookup.clocked_in', true);

        $this->assertStringContainsString(
            strtolower($presentAgent->name),
            strtolower((string) $response->json('data.response.content')),
        );
    }

    public function test_map_pinned_locations_routes_correctly(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyWithAgents();

        CompanyLocation::query()->create([
            'company_id' => $company->id,
            'name' => 'Pinned Shop',
            'address' => '15 Marina',
            'latitude' => 6.45,
            'longitude' => 3.39,
            'is_active' => true,
            'created_by_user_id' => $agent->id,
        ]);

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'how many businesses were pinned on the map?',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'map.pinned_locations_count')
            ->assertJsonPath('data.response.payload.total_pinned_locations', 1);
    }

    public function test_leads_analytics_answers_leads_added_today(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyWithAgents();

        $pipelineId = (int) LeadPipeline::query()->create([
            'company_id' => $company->id,
            'name' => 'Default Pipeline',
            'is_default' => true,
        ])->id;

        Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $agent->id,
            'name' => 'Acme Retail',
            'status' => 'new',
            'phone' => '+2348011111111',
            'location' => 'Lagos',
        ]);

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'How many leads were added today?',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'crm.leads_analytics')
            ->assertJsonPath('data.response.payload.leads_added', 1);

        $this->assertStringContainsString(
            strtolower($agent->name),
            strtolower((string) $response->json('data.response.content')),
        );
    }

    /**
     * @return array{0: Company, 1: User, 2: User, 3: User, 4: User}
     */
    private function seedCompanyWithAgents(): array
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

        $admin = User::factory()->createOne(['name' => 'Ops Admin', 'is_active' => true]);
        $present = User::factory()->createOne(['name' => 'John Wick', 'is_active' => true]);
        $late = User::factory()->createOne(['name' => 'Ada Lovelace', 'is_active' => true]);
        $absent = User::factory()->createOne(['name' => 'Grace Hopper', 'is_active' => true]);

        $company->users()->attach($admin->id, ['role' => 'admin', 'joined_at' => now()]);
        $company->users()->attach($present->id, ['role' => 'agent', 'joined_at' => now()]);
        $company->users()->attach($late->id, ['role' => 'agent', 'joined_at' => now()]);
        $company->users()->attach($absent->id, ['role' => 'agent', 'joined_at' => now()]);

        return [$company, $admin, $present, $late, $absent];
    }
}
