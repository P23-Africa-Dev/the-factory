<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Enums\FieldActivitySessionStatus;
use App\Models\AttendanceRecord;
use App\Models\Company;
use App\Models\FieldActivitySession;
use App\Models\FieldDailySummary;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CopilotFieldTrackingTest extends TestCase
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

    public function test_todays_tracking_returns_team_field_summary(): void
    {
        [$company, $admin, $agentA, $agentB] = $this->seedCompanyWithAgents();
        $today = now()->toDateString();

        $recordA = AttendanceRecord::query()->create([
            'company_id' => $company->id,
            'user_id' => $agentA->id,
            'attendance_date' => $today,
            'clock_in_at' => $today . ' 08:00:00',
            'status' => 'present',
            'is_late' => false,
            'is_auto_clocked_out' => false,
        ]);

        FieldActivitySession::query()->create([
            'company_id' => $company->id,
            'user_id' => $agentA->id,
            'attendance_record_id' => $recordA->id,
            'status' => FieldActivitySessionStatus::ACTIVE,
            'started_at' => now()->startOfDay()->addHours(8),
            'distance_meters' => 5200,
            'travel_seconds' => 3600,
            'stationary_seconds' => 1800,
            'stop_count' => 3,
            'visit_count' => 2,
            'unknown_stop_count' => 1,
            'last_latitude' => 6.45,
            'last_longitude' => 3.39,
            'last_recorded_at' => now(),
        ]);

        FieldDailySummary::query()->create([
            'company_id' => $company->id,
            'user_id' => $agentB->id,
            'summary_date' => $today,
            'distance_meters' => 3100,
            'travel_seconds' => 2400,
            'stationary_seconds' => 1200,
            'stop_count' => 2,
            'visit_count' => 1,
            'unknown_stop_count' => 0,
            'personal_stop_count' => 0,
            'ignored_stop_count' => 0,
            'generated_at' => now(),
        ]);

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => "Show me today's tracking",
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'field.daily_summary')
            ->assertJsonPath('data.response.payload.scope', 'team')
            ->assertJsonPath('data.response.payload.date', $today)
            ->assertJsonPath('data.response.payload.totals.agents_tracked', 2);

        $content = strtolower((string) $response->json('data.response.content'));
        $this->assertStringContainsString(strtolower($agentA->name), $content);
        $this->assertStringContainsString('actively tracking', $content);
    }

    public function test_named_agent_tracking_uses_agent_scope(): void
    {
        [$company, $admin, $agentA] = $this->seedCompanyWithAgents();
        $today = now()->toDateString();

        $record = AttendanceRecord::query()->create([
            'company_id' => $company->id,
            'user_id' => $agentA->id,
            'attendance_date' => $today,
            'clock_in_at' => $today . ' 09:00:00',
            'clock_out_at' => $today . ' 16:00:00',
            'status' => 'present',
            'is_late' => false,
            'is_auto_clocked_out' => false,
        ]);

        FieldActivitySession::query()->create([
            'company_id' => $company->id,
            'user_id' => $agentA->id,
            'attendance_record_id' => $record->id,
            'status' => FieldActivitySessionStatus::COMPLETED,
            'started_at' => now()->startOfDay()->addHours(9),
            'ended_at' => now()->startOfDay()->addHours(16),
            'distance_meters' => 7800,
            'travel_seconds' => 5400,
            'stationary_seconds' => 3600,
            'stop_count' => 4,
            'visit_count' => 3,
            'unknown_stop_count' => 0,
        ]);

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => $agentA->name . "'s tracking today",
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'field.daily_summary')
            ->assertJsonPath('data.response.payload.scope', 'agent')
            ->assertJsonPath('data.response.payload.date', $today)
            ->assertJsonPath('data.response.payload.user_id', $agentA->id);

        $content = strtolower((string) $response->json('data.response.content'));
        $this->assertStringContainsString(strtolower($agentA->name), $content);
        $this->assertStringContainsString('7.8', $content);
    }

    public function test_taraji_tracking_activities_do_not_fall_back_to_admin(): void
    {
        [$company, $admin, $taraji] = $this->seedCompanyWithNamedAgents(
            adminName: 'Tommy Shelby',
            agentAName: 'Taraji Henson',
            agentBName: 'John Wick',
        );
        $today = now()->toDateString();

        $record = AttendanceRecord::query()->create([
            'company_id' => $company->id,
            'user_id' => $taraji->id,
            'attendance_date' => $today,
            'clock_in_at' => $today . ' 08:10:00',
            'status' => 'present',
            'is_late' => false,
            'is_auto_clocked_out' => false,
        ]);

        FieldActivitySession::query()->create([
            'company_id' => $company->id,
            'user_id' => $taraji->id,
            'attendance_record_id' => $record->id,
            'status' => FieldActivitySessionStatus::ACTIVE,
            'started_at' => now()->startOfDay()->addHours(8)->addMinutes(15),
            'distance_meters' => 4200,
            'travel_seconds' => 2000,
            'stationary_seconds' => 900,
            'stop_count' => 2,
            'visit_count' => 1,
            'unknown_stop_count' => 0,
        ]);

        $tracking = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => "What's Taraji's tracking activities for today before clock out",
            ]);

        $tracking
            ->assertOk()
            ->assertJsonPath('data.response.payload.user_id', $taraji->id);

        $trackingContent = strtolower((string) $tracking->json('data.response.content'));
        $this->assertStringContainsString('taraji', $trackingContent);
        $this->assertStringNotContainsString('tommy shelby', $trackingContent);

        $journey = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => "What's the Journey history for Taraji",
            ]);

        $journey
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'field.journey_history');

        $journeyContent = strtolower((string) $journey->json('data.response.content'));
        $this->assertStringContainsString('taraji', $journeyContent);
        $this->assertStringNotContainsString('tommy shelby', $journeyContent);
    }

    public function test_clock_in_alone_still_routes_to_attendance(): void
    {
        [$company, $admin] = $this->seedCompanyWithAgents();

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'who clocked in today?',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'attendance.today_summary');
    }

    /**
     * @return array{0: Company, 1: User, 2: User, 3: User}
     */
    private function seedCompanyWithAgents(): array
    {
        return $this->seedCompanyWithNamedAgents('Ops Admin', 'John Wick', 'Ada Lovelace');
    }

    /**
     * @return array{0: Company, 1: User, 2: User, 3: User}
     */
    private function seedCompanyWithNamedAgents(string $adminName, string $agentAName, string $agentBName): array
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

        $admin = User::factory()->createOne(['name' => $adminName, 'is_active' => true]);
        $agentA = User::factory()->createOne(['name' => $agentAName, 'is_active' => true]);
        $agentB = User::factory()->createOne(['name' => $agentBName, 'is_active' => true]);

        $company->users()->attach($admin->id, ['role' => 'admin', 'joined_at' => now()]);
        $company->users()->attach($agentA->id, ['role' => 'agent', 'joined_at' => now()]);
        $company->users()->attach($agentB->id, ['role' => 'agent', 'joined_at' => now()]);

        return [$company, $admin, $agentA, $agentB];
    }
}
