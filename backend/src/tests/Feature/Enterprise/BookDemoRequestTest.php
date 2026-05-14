<?php

declare(strict_types=1);

namespace Tests\Feature\Enterprise;

use App\Models\CompanyDemoRequest;
use App\Notifications\EnterpriseDemoRequestAdminNotification;
use App\Notifications\EnterpriseDemoRequestReceivedNotification;
use App\Services\Enterprise\DemoRequestService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class BookDemoRequestTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_submit_enterprise_demo_request(): void
    {
        Notification::fake();

        $response = $this->postJson('/api/v1/enterprise/demo-requests', [
            'full_name' => 'Ada Lovelace',
            'email' => 'ada@analytical.co',
            'company_name' => 'Analytical Engines Ltd',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'We need enterprise workflows for secure collaboration.',
        ]);

        $response->assertStatus(201)
            ->assertJson(['success' => true]);

        $this->assertDatabaseHas('company_demo_requests', [
            'email' => 'ada@analytical.co',
            'status' => 'pending',
        ]);

        Notification::assertSentOnDemand(EnterpriseDemoRequestReceivedNotification::class);
        Notification::assertSentOnDemand(EnterpriseDemoRequestAdminNotification::class);
    }

    public function test_duplicate_pending_request_is_rejected(): void
    {
        CompanyDemoRequest::create([
            'full_name' => 'Ada Lovelace',
            'email' => 'ada@analytical.co',
            'company_name' => 'Analytical Engines Ltd',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'Original pending request',
            'status' => 'pending',
            'requested_at' => now(),
        ]);

        $response = $this->postJson('/api/v1/enterprise/demo-requests', [
            'full_name' => 'Ada Lovelace',
            'email' => 'ada@analytical.co',
            'company_name' => 'Analytical Engines Ltd',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'Second request should fail because first is pending.',
        ]);

        $response->assertStatus(409)
            ->assertJson(['success' => false]);
    }

    public function test_submit_returns_503_when_confirmation_email_delivery_fails(): void
    {
        $this->mock(DemoRequestService::class, function ($mock): void {
            $mock->shouldReceive('submit')
                ->once()
                ->andThrow(new \App\Exceptions\EnterpriseNotificationDeliveryException(
                    'Unable to deliver demo request confirmation right now. Please try again shortly.',
                    ['ada@analytical.co'],
                ));
        });

        $response = $this->postJson('/api/v1/enterprise/demo-requests', [
            'full_name' => 'Ada Lovelace',
            'email' => 'ada@analytical.co',
            'company_name' => 'Analytical Engines Ltd',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'We need enterprise workflows for secure collaboration.',
        ]);

        $response->assertStatus(503)
            ->assertJson([
                'success' => false,
                'message' => 'Unable to deliver demo request confirmation right now. Please try again shortly.',
            ]);

        $this->assertDatabaseMissing('company_demo_requests', [
            'email' => 'ada@analytical.co',
            'status' => 'pending',
        ]);
    }
}
