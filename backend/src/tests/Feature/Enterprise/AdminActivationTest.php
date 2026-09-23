<?php

declare(strict_types=1);

namespace Tests\Feature\Enterprise;

use App\Exceptions\EnterpriseNotificationDeliveryException;
use App\Models\Admin;
use App\Models\CompanyDemoRequest;
use App\Models\User;
use App\Notifications\EnterpriseActivationNotification;
use App\Services\Enterprise\DemoRequestService;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use ReflectionClass;
use Tests\TestCase;

class AdminActivationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware(PreventRequestForgery::class);
    }

    public function test_admin_can_approve_and_send_activation(): void
    {
        Notification::fake();

        $admin = Admin::create([
            'name' => 'Platform Admin',
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $demoRequest = CompanyDemoRequest::create([
            'full_name' => 'Ada Lovelace',
            'email' => 'ada@analytical.co',
            'company_name' => 'Analytical Engines Ltd',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'We need enterprise workflows for secure collaboration.',
            'status' => 'pending',
            'requested_at' => now(),
        ]);

        $this->actingAs($admin, 'admin')
            ->patch(route('admin.enterprise.demo-requests.activate', $demoRequest), [
                'admin_notes' => 'Approved for activation.',
            ])
            ->assertRedirect(route('admin.enterprise.demo-requests.show', $demoRequest));

        $demoRequest->refresh();

        $this->assertSame('approved', $demoRequest->status);
        $this->assertNotNull($demoRequest->company_id);
        $this->assertNotNull($demoRequest->user_id);
        $this->assertNotNull($demoRequest->activation_token_hash);
        $this->assertNotNull($demoRequest->activation_link_expires_at);

        $user = $demoRequest->user;
        $this->assertNotNull($user);
        Notification::assertSentTo($user, EnterpriseActivationNotification::class);

        $this->assertDatabaseHas('companies', [
            'id' => $demoRequest->company_id,
            'name' => 'Analytical Engines Ltd',
        ]);

        $this->assertDatabaseHas('company_users', [
            'company_id' => $demoRequest->company_id,
            'user_id' => $demoRequest->user_id,
            'role' => 'owner',
        ]);
    }

    public function test_admin_can_save_registration_as_draft(): void
    {
        $admin = Admin::create([
            'name' => 'Platform Admin',
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $demoRequest = CompanyDemoRequest::create([
            'full_name' => 'Ada Lovelace',
            'email' => 'ada@analytical.co',
            'company_name' => 'Analytical Engines Ltd',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'We need enterprise workflows for secure collaboration.',
            'status' => 'pending',
            'requested_at' => now(),
        ]);

        $this->actingAs($admin, 'admin')
            ->patch(route('admin.enterprise.demo-requests.activate', $demoRequest), [
                'action' => 'draft',
                'full_name' => 'Ada L.',
                'email' => 'enterprise-admin@analytical.co',
                'company_name' => 'Analytical Engines Plc',
                'country' => 'GB',
                'team_size' => '51-200',
                'purpose' => 'enterprise',
                'user_type' => 'operations',
                'admin_notes' => 'Pending legal review',
            ])
            ->assertRedirect(route('admin.enterprise.demo-requests.show', $demoRequest));

        $demoRequest->refresh();

        $this->assertSame('draft', $demoRequest->status);
        $this->assertSame('enterprise-admin@analytical.co', $demoRequest->email);
        $this->assertSame('enterprise', $demoRequest->registration_purpose);
        $this->assertSame('operations', $demoRequest->registration_user_type);
        $this->assertNull($demoRequest->company_id);
        $this->assertNull($demoRequest->user_id);
        $this->assertNull($demoRequest->activation_token_hash);
    }

    public function test_admin_activation_uses_registration_payload_values(): void
    {
        Notification::fake();

        $admin = Admin::create([
            'name' => 'Platform Admin',
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $demoRequest = CompanyDemoRequest::create([
            'full_name' => 'Legacy Name',
            'email' => 'legacy@analytical.co',
            'company_name' => 'Legacy Company',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'Legacy use case',
            'status' => 'pending',
            'requested_at' => now(),
        ]);

        $this->actingAs($admin, 'admin')
            ->patch(route('admin.enterprise.demo-requests.activate', $demoRequest), [
                'action' => 'activate',
                'full_name' => 'Enterprise Owner',
                'email' => 'owner@analytical.co',
                'company_name' => 'Analytical Enterprises',
                'country' => 'US',
                'team_size' => '201-500',
                'purpose' => 'enterprise',
                'user_type' => 'founder',
                'admin_notes' => 'Ready for go-live.',
            ])
            ->assertRedirect(route('admin.enterprise.demo-requests.show', $demoRequest));

        $demoRequest->refresh();

        $this->assertSame('approved', $demoRequest->status);
        $this->assertSame('owner@analytical.co', $demoRequest->email);
        $this->assertSame('enterprise', $demoRequest->registration_purpose);
        $this->assertSame('founder', $demoRequest->registration_user_type);

        $this->assertDatabaseHas('companies', [
            'id' => $demoRequest->company_id,
            'name' => 'Analytical Enterprises',
            'country' => 'US',
            'team_size' => '201-500',
            'use_case' => 'enterprise',
        ]);

        $this->assertDatabaseHas('users', [
            'id' => $demoRequest->user_id,
            'email' => 'owner@analytical.co',
            'name' => 'Enterprise Owner',
            'is_active' => 1,
        ]);
    }

    public function test_admin_activation_redirects_back_with_error_when_email_delivery_fails(): void
    {
        $admin = Admin::create([
            'name' => 'Platform Admin',
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $demoRequest = CompanyDemoRequest::create([
            'full_name' => 'Ada Lovelace',
            'email' => 'ada@analytical.co',
            'company_name' => 'Analytical Engines Ltd',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'We need enterprise workflows for secure collaboration.',
            'status' => 'pending',
            'requested_at' => now(),
        ]);

        $this->mock(DemoRequestService::class, function ($mock): void {
            $mock->shouldReceive('registerFromAdmin')
                ->once()
                ->andThrow(new EnterpriseNotificationDeliveryException(
                    'Unable to deliver the enterprise activation email right now. Please retry activation shortly.',
                    ['ada@analytical.co'],
                ));
        });

        $this->from(route('admin.enterprise.demo-requests.show', $demoRequest))
            ->actingAs($admin, 'admin')
            ->patch(route('admin.enterprise.demo-requests.activate', $demoRequest), [
                'admin_notes' => 'Approved for activation.',
            ])
            ->assertRedirect(route('admin.enterprise.demo-requests.show', $demoRequest))
            ->assertSessionHasErrors([
                'email' => 'Unable to deliver the enterprise activation email right now. Please retry activation shortly.',
            ]);
    }

    public function test_activation_link_uses_explicit_setup_url_and_includes_required_query_params(): void
    {
        Notification::fake();

        config()->set('enterprise.onboarding_setup_url', 'https://thefactory23.com/enterprise/setup');
        config()->set('enterprise.frontend_url', 'http://localhost:3000');

        $admin = Admin::create([
            'name' => 'Platform Admin',
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $demoRequest = CompanyDemoRequest::create([
            'full_name' => 'Ada Lovelace',
            'email' => 'ada@analytical.co',
            'company_name' => 'Analytical Engines Ltd',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'We need enterprise workflows for secure collaboration.',
            'status' => 'pending',
            'requested_at' => now(),
        ]);

        $this->actingAs($admin, 'admin')
            ->patch(route('admin.enterprise.demo-requests.activate', $demoRequest), [
                'admin_notes' => 'Approved for activation.',
            ])
            ->assertRedirect(route('admin.enterprise.demo-requests.show', $demoRequest));

        $demoRequest->refresh();
        $user = $demoRequest->user;
        $this->assertNotNull($user);
        $this->assertNotNull($demoRequest->company);

        Notification::assertSentTo($user, EnterpriseActivationNotification::class, function (EnterpriseActivationNotification $notification) use ($demoRequest): bool {
            $link = $this->extractActivationLink($notification);

            $this->assertStringStartsWith('https://thefactory23.com/enterprise/setup?', $link);

            $parts = parse_url($link);
            parse_str((string) ($parts['query'] ?? ''), $query);

            $this->assertSame((string) $demoRequest->id, (string) ($query['request_id'] ?? null));
            $this->assertSame($demoRequest->email, (string) ($query['email'] ?? null));
            $this->assertSame($demoRequest->company?->company_id, (string) ($query['company_id'] ?? null));
            $this->assertNotEmpty($query['token'] ?? null);
            $this->assertSame(64, strlen((string) $query['token']));

            return true;
        });
    }

    public function test_activation_link_falls_back_to_frontend_url_when_setup_url_is_not_set(): void
    {
        Notification::fake();

        config()->set('enterprise.onboarding_setup_url', null);
        config()->set('enterprise.frontend_url', 'http://localhost:3000');
        config()->set('enterprise.onboarding_setup_path', '/enterprise/setup');

        $admin = Admin::create([
            'name' => 'Platform Admin',
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $demoRequest = CompanyDemoRequest::create([
            'full_name' => 'Grace Hopper',
            'email' => 'grace@compiler.co',
            'company_name' => 'Compiler Labs',
            'country' => 'US',
            'team_size' => '51-200',
            'use_case' => 'Enterprise workflows',
            'status' => 'pending',
            'requested_at' => now(),
        ]);

        $this->actingAs($admin, 'admin')
            ->patch(route('admin.enterprise.demo-requests.activate', $demoRequest), [
                'admin_notes' => 'Approved for activation.',
            ])
            ->assertRedirect(route('admin.enterprise.demo-requests.show', $demoRequest));

        $demoRequest->refresh();
        $user = $demoRequest->user;
        $this->assertNotNull($user);

        Notification::assertSentTo($user, EnterpriseActivationNotification::class, function (EnterpriseActivationNotification $notification): bool {
            $link = $this->extractActivationLink($notification);
            $this->assertStringStartsWith('http://localhost:3000/enterprise/setup?', $link);

            return true;
        });
    }

    public function test_admin_activation_fails_when_onboarding_setup_url_configuration_is_invalid(): void
    {
        config()->set('enterprise.onboarding_setup_url', 'invalid-url');
        config()->set('enterprise.frontend_url', '');
        config()->set('enterprise.onboarding_setup_path', '/enterprise/setup');

        $admin = Admin::create([
            'name' => 'Platform Admin',
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $demoRequest = CompanyDemoRequest::create([
            'full_name' => 'Broken Config',
            'email' => 'broken@config.test',
            'company_name' => 'Broken Config Ltd',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'Enterprise workflows',
            'status' => 'pending',
            'requested_at' => now(),
        ]);

        $this->from(route('admin.enterprise.demo-requests.show', $demoRequest))
            ->actingAs($admin, 'admin')
            ->patch(route('admin.enterprise.demo-requests.activate', $demoRequest), [
                'admin_notes' => 'Approved for activation.',
            ])
            ->assertRedirect(route('admin.enterprise.demo-requests.show', $demoRequest))
            ->assertSessionHasErrors([
                'email' => 'Enterprise onboarding setup URL is not configured correctly. Please contact support.',
            ]);
    }

    public function test_admin_activation_can_reuse_email_from_soft_deleted_user(): void
    {
        Notification::fake();

        $deletedUser = User::factory()->create([
            'name' => 'Old Deleted Owner',
            'email' => 'reused-owner@analytical.co',
            'internal_role' => 'agent',
        ]);
        $deletedUser->delete();

        $admin = Admin::create([
            'name' => 'Platform Admin',
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $demoRequest = CompanyDemoRequest::create([
            'full_name' => 'New Owner',
            'email' => 'reused-owner@analytical.co',
            'company_name' => 'Reused Owner Company',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'Enterprise workflows',
            'status' => 'pending',
            'requested_at' => now(),
        ]);

        $this->actingAs($admin, 'admin')
            ->patch(route('admin.enterprise.demo-requests.activate', $demoRequest), [
                'admin_notes' => 'Approved for activation.',
            ])
            ->assertRedirect(route('admin.enterprise.demo-requests.show', $demoRequest));

        $demoRequest->refresh();

        $this->assertNotNull($demoRequest->user_id);
        $this->assertNotSame($deletedUser->id, $demoRequest->user_id);
        $this->assertSoftDeleted('users', ['id' => $deletedUser->id]);
        $this->assertDatabaseHas('users', [
            'id' => $demoRequest->user_id,
            'email' => 'reused-owner@analytical.co',
            'deleted_at' => null,
        ]);
    }

    public function test_admin_can_provision_account_without_sending_activation_email(): void
    {
        Notification::fake();

        $admin = Admin::create([
            'name' => 'Platform Admin',
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $demoRequest = CompanyDemoRequest::create([
            'full_name' => 'Ada Lovelace',
            'email' => 'ada@analytical.co',
            'company_name' => 'Analytical Engines Ltd',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'Enterprise workflows',
            'status' => 'pending',
            'requested_at' => now(),
        ]);

        $this->actingAs($admin, 'admin')
            ->patch(route('admin.enterprise.demo-requests.activate', $demoRequest), [
                'action' => 'provision',
                'assigned_plan_key' => 'up_to_5',
                'assigned_billing_interval' => 'monthly',
            ])
            ->assertRedirect(route('admin.enterprise.demo-requests.show', $demoRequest));

        $demoRequest->refresh();

        $this->assertSame('provisioned', $demoRequest->status);
        $this->assertNotNull($demoRequest->company_id);
        $this->assertNotNull($demoRequest->user_id);
        $this->assertNull($demoRequest->activation_token_hash);
        Notification::assertNothingSent();
    }

    public function test_admin_can_send_activation_after_provision(): void
    {
        Notification::fake();

        $admin = Admin::create([
            'name' => 'Platform Admin',
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $demoRequest = CompanyDemoRequest::create([
            'full_name' => 'Ada Lovelace',
            'email' => 'ada@analytical.co',
            'company_name' => 'Analytical Engines Ltd',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'Enterprise workflows',
            'status' => 'pending',
            'requested_at' => now(),
        ]);

        $this->actingAs($admin, 'admin')
            ->patch(route('admin.enterprise.demo-requests.activate', $demoRequest), [
                'action' => 'provision',
            ])
            ->assertRedirect();

        $this->actingAs($admin, 'admin')
            ->patch(route('admin.enterprise.demo-requests.activate', $demoRequest), [
                'action' => 'activate',
            ])
            ->assertRedirect(route('admin.enterprise.demo-requests.show', $demoRequest));

        $demoRequest->refresh();

        $this->assertSame('approved', $demoRequest->status);
        $this->assertNotNull($demoRequest->activation_token_hash);
        Notification::assertSentTo($demoRequest->user, EnterpriseActivationNotification::class);
    }

    public function test_admin_can_mark_already_paid_during_activation(): void
    {
        Notification::fake();

        $admin = Admin::create([
            'name' => 'Platform Admin',
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $demoRequest = CompanyDemoRequest::create([
            'full_name' => 'Ada Lovelace',
            'email' => 'ada@analytical.co',
            'company_name' => 'Analytical Engines Ltd',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'Enterprise workflows',
            'status' => 'pending',
            'requested_at' => now(),
        ]);

        $this->actingAs($admin, 'admin')
            ->patch(route('admin.enterprise.demo-requests.activate', $demoRequest), [
                'action' => 'activate',
                'assigned_plan_key' => 'up_to_5',
                'assigned_billing_interval' => 'monthly',
                'already_paid' => true,
                'payment_start_date' => '2026-09-01',
            ])
            ->assertRedirect(route('admin.enterprise.demo-requests.show', $demoRequest));

        $demoRequest->refresh();
        $company = $demoRequest->company;

        $this->assertNotNull($company);
        $this->assertSame('active', $company->subscription_status);
        $this->assertSame('up_to_5', $company->subscription_plan_key);
        $this->assertSame('monthly', $company->subscription_billing_interval);
        $this->assertSame('2026-09-01', $company->subscription_current_period_start?->format('Y-m-d'));
        $this->assertSame('2026-10-01', $company->subscription_current_period_end?->format('Y-m-d'));
        Notification::assertSentTo($demoRequest->user, EnterpriseActivationNotification::class);
    }

    public function test_admin_can_generate_payment_link_after_provision(): void
    {
        Notification::fake();

        $admin = Admin::create([
            'name' => 'Platform Admin',
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $demoRequest = CompanyDemoRequest::create([
            'full_name' => 'Ada Lovelace',
            'email' => 'ada@analytical.co',
            'company_name' => 'Analytical Engines Ltd',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'Enterprise workflows',
            'status' => 'pending',
            'requested_at' => now(),
        ]);

        $this->actingAs($admin, 'admin')
            ->patch(route('admin.enterprise.demo-requests.activate', $demoRequest), [
                'action' => 'provision',
                'assigned_plan_key' => 'up_to_5',
                'assigned_billing_interval' => 'monthly',
            ])
            ->assertRedirect();

        $this->actingAs($admin, 'admin')
            ->post(route('admin.enterprise.demo-requests.payment-link', $demoRequest), [
                'plan_key' => 'up_to_5',
                'interval' => 'monthly',
            ])
            ->assertRedirect()
            ->assertSessionHas('payment_link_url');

        $demoRequest->refresh();
        $this->assertNotNull($demoRequest->company?->payment_link_token_hash);
    }

    public function test_admin_can_directly_register_user_and_send_activation(): void
    {
        Notification::fake();

        $admin = Admin::create([
            'name' => 'Platform Admin',
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $response = $this->actingAs($admin, 'admin')
            ->post(route('admin.enterprise.demo-requests.store'), [
                'action' => 'activate',
                'full_name' => 'Offline Buyer',
                'email' => 'offline@buyer.test',
                'company_name' => 'Offline Buyer Co',
                'country' => 'Nigeria',
                'team_size' => '2-10',
                'purpose' => 'enterprise',
                'user_type' => 'founder',
                'assigned_plan_key' => 'up_to_10',
                'assigned_billing_interval' => 'annual',
                'already_paid' => true,
                'payment_start_date' => '2026-01-15',
            ]);

        $demoRequest = CompanyDemoRequest::query()->where('email', 'offline@buyer.test')->first();
        $this->assertNotNull($demoRequest);
        $response->assertRedirect(route('admin.enterprise.demo-requests.show', $demoRequest));

        $this->assertSame('admin_direct', $demoRequest->source);
        $this->assertSame('approved', $demoRequest->status);
        $this->assertSame('active', $demoRequest->company?->subscription_status);
        $this->assertSame('up_to_10', $demoRequest->company?->subscription_plan_key);
        $this->assertSame('2026-01-15', $demoRequest->company?->subscription_current_period_start?->format('Y-m-d'));
        $this->assertSame('2027-01-15', $demoRequest->company?->subscription_current_period_end?->format('Y-m-d'));
        Notification::assertSentTo($demoRequest->user, EnterpriseActivationNotification::class);
    }

    private function extractActivationLink(EnterpriseActivationNotification $notification): string
    {
        $reflection = new ReflectionClass($notification);
        $property = $reflection->getProperty('onboardingLink');
        $property->setAccessible(true);

        return (string) $property->getValue($notification);
    }
}
