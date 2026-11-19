<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Console\Commands\RunScheduledAutomationsCommand;
use App\Models\AttendanceRecord;
use App\Models\Company;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\User;
use App\Services\AI\ActionFieldCatalog;
use App\Services\AI\Context\ConversationMemoryService;
use App\Services\AI\Kpi\KpiInferenceService;
use App\Services\AI\Policy\ActionConfirmationPolicyService;
use App\Services\AI\Tools\ActionToolRegistry;
use App\Services\AI\Tools\ReadToolRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * Phase 0 of the ELY upgrade: role scoping, confirmation and automation fixes.
 */
final class ElyPhaseZeroSafetyTest extends TestCase
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

    public function test_agent_attendance_duration_only_shows_their_own_record(): void
    {
        [$company, , $supervisor, $agentA, $agentB] = $this->seedCompany();
        $today = now()->toDateString();
        $this->clockIn($company, $agentA, $today, 480);
        $this->clockIn($company, $agentB, $today, 300);

        $result = app(ReadToolRegistry::class)->execute('attendance.duration_summary', $agentA, (int) $company->id, []);

        $names = array_column($result['payload']['records'] ?? [], 'agent_name');
        $this->assertSame([$agentA->name], $names);
    }

    public function test_supervisor_attendance_duration_only_shows_their_team(): void
    {
        [$company, , $supervisor, $agentA, $agentB] = $this->seedCompany();
        $today = now()->toDateString();
        $this->clockIn($company, $agentA, $today, 480);
        $this->clockIn($company, $agentB, $today, 300);

        $result = app(ReadToolRegistry::class)->execute('attendance.duration_summary', $supervisor, (int) $company->id, []);

        $names = array_column($result['payload']['records'] ?? [], 'agent_name');
        $this->assertSame([$agentA->name], $names);
    }

    public function test_unknown_agent_name_returns_no_attendance_instead_of_everyone(): void
    {
        [$company, $admin, , $agentA, $agentB] = $this->seedCompany();
        $today = now()->toDateString();
        $this->clockIn($company, $agentA, $today, 480);
        $this->clockIn($company, $agentB, $today, 300);

        $result = app(ReadToolRegistry::class)->execute('attendance.duration_summary', $admin, (int) $company->id, [
            'agent_name' => 'Nobody Byname',
        ]);

        $this->assertSame([], $result['payload']['records'] ?? []);
    }

    public function test_agent_leads_analytics_only_counts_their_own_leads(): void
    {
        [$company, $admin, , $agentA, $agentB] = $this->seedCompany();
        $pipelineId = (int) LeadPipeline::query()->create([
            'company_id' => $company->id,
            'name' => 'Default Pipeline',
            'is_default' => true,
        ])->id;

        foreach ([[$agentA, 'Acme Retail'], [$agentB, 'Beta Stores'], [$agentB, 'Gamma Foods']] as [$owner, $name]) {
            Lead::query()->create([
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'created_by_user_id' => $owner->id,
                'name' => $name,
                'status' => 'new',
            ]);
        }

        $registry = app(ReadToolRegistry::class);
        $agentView = $registry->execute('crm.leads_analytics', $agentA, (int) $company->id, []);
        $adminView = $registry->execute('crm.leads_analytics', $admin, (int) $company->id, []);

        $this->assertSame(1, $agentView['payload']['leads_added']);
        $this->assertStringNotContainsString($agentB->name, $agentView['summary']);
        $this->assertSame(3, $adminView['payload']['leads_added']);
    }

    public function test_bare_yes_without_a_shown_draft_prepares_a_preview_instead_of_executing(): void
    {
        [$company, $admin] = $this->seedCompany();
        LeadPipeline::query()->create([
            'company_id' => $company->id,
            'name' => 'Default Pipeline',
            'is_default' => true,
        ]);

        $threadId = (string) Str::uuid();
        $memory = app(ConversationMemoryService::class);
        $memory->appendMessage((int) $company->id, (int) $admin->id, $threadId, 'user', 'We should add a lead for Acme Foods, phone 08011111111');
        $memory->appendMessage((int) $company->id, (int) $admin->id, $threadId, 'assistant', 'Sure, tell me when you want it added.');

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'thread_id' => $threadId,
                'message' => 'yes',
            ]);

        $response->assertOk();
        $this->assertSame(0, Lead::query()->where('company_id', $company->id)->count());
        if ($response->json('data.response.tool') === 'crm.create_lead') {
            $response->assertJsonPath('data.response.payload.confirmation_required', true);
        }
    }

    public function test_kpi_update_requires_confirmation_and_has_a_field_catalog(): void
    {
        $this->assertTrue(app(ActionConfirmationPolicyService::class)->requiresConfirmation('kpis.update'));
        $this->assertSame(['kpi_id'], ActionFieldCatalog::forTool('kpis.update')['required']);
        $this->assertSame(['kpi_id'], ActionFieldCatalog::missingRequired('kpis.update', []));
    }

    public function test_kpi_update_inference_extracts_target_and_priority(): void
    {
        $args = app(KpiInferenceService::class)->inferUpdate(
            'Update the KPI target to 150 visits and set priority to high',
            999,
            ['kpi_id' => '42'],
        );

        $this->assertSame(42, $args['kpi_id']);
        $this->assertSame('150 visits', $args['target_value']);
        $this->assertSame('high', $args['priority']);
    }

    public function test_supervisor_cannot_broadcast_notifications_to_admins(): void
    {
        [$company, , $supervisor] = $this->seedCompany();

        $this->expectException(ValidationException::class);

        app(ActionToolRegistry::class)->execute('notifications.send', $supervisor, (int) $company->id, [
            'title' => 'Heads up',
            'message' => 'Please review the board.',
            'roles' => ['admin'],
            'delivery_types' => ['in_app'],
        ]);
    }

    public function test_supervisor_agent_broadcast_only_reaches_their_team(): void
    {
        [$company, , $supervisor, $agentA, $agentB] = $this->seedCompany();

        $result = app(ActionToolRegistry::class)->execute('notifications.send', $supervisor, (int) $company->id, [
            'title' => 'Heads up',
            'message' => 'Please review the board.',
            'roles' => ['agent'],
            'delivery_types' => ['in_app'],
        ]);

        $this->assertSame(1, $result['payload']['count']);
    }

    public function test_supervisor_cannot_notify_an_agent_outside_their_team(): void
    {
        [$company, , $supervisor, , $agentB] = $this->seedCompany();

        $this->expectException(ValidationException::class);

        app(ActionToolRegistry::class)->execute('notifications.send', $supervisor, (int) $company->id, [
            'title' => 'Heads up',
            'message' => 'Please review the board.',
            'user_ids' => [$agentB->id],
            'delivery_types' => ['in_app'],
        ]);
    }

    public function test_scheduled_automation_occurrences(): void
    {
        $now = Carbon::parse('2026-11-19 10:30:00'); // a Thursday

        $this->assertSame(
            '2026-11-19 09:00',
            RunScheduledAutomationsCommand::latestOccurrence('schedule.daily', 'daily:09:00', $now)?->format('Y-m-d H:i'),
        );
        $this->assertSame(
            '2026-11-18 11:00',
            RunScheduledAutomationsCommand::latestOccurrence('schedule.daily', 'daily:11:00', $now)?->format('Y-m-d H:i'),
        );
        $this->assertSame(
            '2026-11-16 09:00',
            RunScheduledAutomationsCommand::latestOccurrence('schedule.weekly', 'weekly:monday:09:00', $now)?->format('Y-m-d H:i'),
        );
        $this->assertSame(
            '2026-11-12 11:00',
            RunScheduledAutomationsCommand::latestOccurrence('schedule.weekly', 'weekly:thursday:11:00', $now)?->format('Y-m-d H:i'),
        );
        $this->assertNull(RunScheduledAutomationsCommand::latestOccurrence('schedule.daily', 'garbage', $now));
    }

    /**
     * @return array{0: Company, 1: User, 2: User, 3: User, 4: User}
     */
    private function seedCompany(): array
    {
        $company = Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'Factory '.Str::upper(Str::random(4)),
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Operations management',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $admin = User::factory()->createOne(['name' => 'Ops Admin', 'is_active' => true]);
        $supervisor = User::factory()->createOne(['name' => 'Sam Supervisor', 'is_active' => true]);
        $agentA = User::factory()->createOne(['name' => 'Ada Field', 'is_active' => true]);
        $agentB = User::factory()->createOne(['name' => 'Bola Outside', 'is_active' => true]);
        $agentA->forceFill(['supervisor_user_id' => $supervisor->id])->save();

        $company->users()->attach($admin->id, ['role' => 'admin', 'joined_at' => now()]);
        $company->users()->attach($supervisor->id, ['role' => 'supervisor', 'joined_at' => now()]);
        $company->users()->attach($agentA->id, ['role' => 'agent', 'joined_at' => now()]);
        $company->users()->attach($agentB->id, ['role' => 'agent', 'joined_at' => now()]);

        return [$company, $admin, $supervisor, $agentA, $agentB];
    }

    private function clockIn(Company $company, User $user, string $date, int $minutes): void
    {
        AttendanceRecord::query()->create([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'attendance_date' => $date,
            'clock_in_at' => $date.' 08:00:00',
            'clock_out_at' => $date.' 17:00:00',
            'status' => 'present',
            'work_duration_minutes' => $minutes,
            'is_late' => false,
            'is_auto_clocked_out' => false,
        ]);
    }
}
