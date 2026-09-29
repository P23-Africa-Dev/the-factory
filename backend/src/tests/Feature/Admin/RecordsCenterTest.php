<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Admin;
use App\Models\RecordDisclosure;
use App\Models\SecurityAuditEvent;
use App\Services\Security\SecurityAuditLogger;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RecordsCenterTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware(PreventRequestForgery::class);
    }

    public function test_non_super_admin_cannot_open_records(): void
    {
        $admin = Admin::create([
            'name' => 'Supervisor Admin',
            'email' => 'supervisor-admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'supervisor',
            'is_active' => true,
        ]);

        $this->actingAs($admin, 'admin')
            ->get(route('admin.records.index'))
            ->assertForbidden();
    }

    public function test_control_dashboard_sign_in_writes_a_security_event(): void
    {
        Admin::create([
            'name' => 'Ops Admin',
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $this->post('/admin/login', [
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
        ])->assertRedirect(route('admin.dashboard'));

        $this->assertDatabaseHas('security_audit_events', [
            'action' => SecurityAuditLogger::LOGIN_SUCCEEDED,
            'result' => SecurityAuditLogger::SUCCESS,
            'channel' => SecurityAuditLogger::CHANNEL_ADMIN_WEB,
            'email' => 'admin@example.com',
        ]);
    }

    public function test_opening_a_report_is_logged(): void
    {
        $admin = Admin::create([
            'name' => 'Ops Admin',
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        SecurityAuditEvent::query()->create([
            'action' => SecurityAuditLogger::LOGIN_SUCCEEDED,
            'result' => SecurityAuditLogger::SUCCESS,
            'channel' => SecurityAuditLogger::CHANNEL_ADMIN_API,
            'email' => 'visible@example.com',
            'created_at' => now()->subDay(),
        ]);

        $this->actingAs($admin, 'admin')
            ->get(route('admin.records.show', 'security-events'))
            ->assertOk()
            ->assertSee('visible@example.com')
            ->assertSee('Security events');

        $this->assertDatabaseHas('record_disclosures', [
            'admin_id' => $admin->id,
            'report' => 'security-events',
            'action' => RecordDisclosure::ACTION_VIEW,
        ]);
    }

    public function test_date_filtered_export_returns_only_that_range_and_records_the_disclosure(): void
    {
        $admin = Admin::create([
            'name' => 'Ops Admin',
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        SecurityAuditEvent::query()->create([
            'action' => SecurityAuditLogger::LOGIN_SUCCEEDED,
            'result' => SecurityAuditLogger::SUCCESS,
            'channel' => SecurityAuditLogger::CHANNEL_ADMIN_API,
            'email' => 'in-range@example.com',
            'created_at' => now()->subDay(),
        ]);

        SecurityAuditEvent::query()->create([
            'action' => SecurityAuditLogger::LOGIN_FAILED,
            'result' => SecurityAuditLogger::FAILURE,
            'channel' => SecurityAuditLogger::CHANNEL_ADMIN_API,
            'email' => 'outside-range@example.com',
            'created_at' => now()->subDays(40),
        ]);

        $response = $this->actingAs($admin, 'admin')->post(route('admin.records.export', 'security-events'), [
            'from' => now()->subDays(7)->toDateString(),
            'to' => now()->toDateString(),
            'requester_type' => 'government',
            'reference' => 'CASE-100',
            'note' => 'Requested by the records office for this date range.',
        ]);

        $response->assertOk();
        $content = $response->streamedContent();

        $this->assertStringContainsString('in-range@example.com', $content);
        $this->assertStringNotContainsString('outside-range@example.com', $content);

        $this->assertDatabaseHas('record_disclosures', [
            'admin_id' => $admin->id,
            'report' => 'security-events',
            'action' => RecordDisclosure::ACTION_EXPORT,
            'requester_type' => 'government',
            'reference' => 'CASE-100',
            'row_count' => 1,
        ]);
    }
}
