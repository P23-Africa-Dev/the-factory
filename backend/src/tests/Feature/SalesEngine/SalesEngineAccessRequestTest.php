<?php

declare(strict_types=1);

namespace Tests\Feature\SalesEngine;

use App\Models\Admin;
use App\Models\SalesEngineAccessRequest;
use App\Notifications\SalesEngineAccessRequestAdminNotification;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\Support\ActivatesCompanySubscription;
use Tests\TestCase;

class SalesEngineAccessRequestTest extends TestCase
{
    use ActivatesCompanySubscription;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware(PreventRequestForgery::class);

        config([
            'services.sales_engine.api_url' => 'https://se.test',
            'services.sales_engine.internal_token' => 'test-internal-token',
            'services.sales_engine.access_request_notify_email' => 'ops@example.com',
        ]);
    }

    public function test_user_can_submit_access_request_and_ops_is_notified(): void
    {
        Notification::fake();

        ['user' => $owner, 'company' => $company] = $this->createCompanyWithOwner();

        $response = $this->withToken($this->ownerToken($owner))
            ->postJson('/api/v1/admin/sales-engine/access-requests', [
                'company_id' => $company->id,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.request.email', $owner->email);

        $this->assertDatabaseHas('sales_engine_access_requests', [
            'user_id' => $owner->id,
            'status' => 'pending',
            'email' => $owner->email,
        ]);

        Notification::assertSentOnDemand(SalesEngineAccessRequestAdminNotification::class);
    }

    public function test_submit_is_idempotent_while_pending(): void
    {
        Notification::fake();

        ['user' => $owner, 'company' => $company] = $this->createCompanyWithOwner();
        $token = $this->ownerToken($owner);

        $first = $this->withToken($token)
            ->postJson('/api/v1/admin/sales-engine/access-requests', ['company_id' => $company->id])
            ->assertCreated()
            ->json('data.request.id');

        $second = $this->withToken($token)
            ->postJson('/api/v1/admin/sales-engine/access-requests', ['company_id' => $company->id])
            ->assertCreated()
            ->json('data.request.id');

        $this->assertSame($first, $second);
        $this->assertSame(1, SalesEngineAccessRequest::query()->count());
    }

    public function test_status_endpoint_returns_none_then_pending(): void
    {
        ['user' => $owner] = $this->createCompanyWithOwner();
        $token = $this->ownerToken($owner);

        $this->withToken($token)
            ->getJson('/api/v1/admin/sales-engine/access-requests/status')
            ->assertOk()
            ->assertJsonPath('data.status', 'none');

        SalesEngineAccessRequest::query()->create([
            'user_id' => $owner->id,
            'email' => $owner->email,
            'name' => $owner->name,
            'status' => 'pending',
            'requested_at' => now(),
        ]);

        $this->withToken($token)
            ->getJson('/api/v1/admin/sales-engine/access-requests/status')
            ->assertOk()
            ->assertJsonPath('data.status', 'pending');
    }

    public function test_admin_can_approve_and_provisions_sales_engine_user(): void
    {
        Http::fake([
            'se.test/api/v1/auth/factory23/provision' => Http::response([
                'created' => true,
                'user' => ['email' => 'owner@example.com'],
                'organization' => ['id' => 1],
            ], 201),
        ]);

        ['user' => $owner, 'company' => $company] = $this->createCompanyWithOwner([
            'name' => 'Acme Co',
        ], [
            'email' => 'owner@example.com',
            'name' => 'Owner User',
        ]);

        $accessRequest = SalesEngineAccessRequest::query()->create([
            'user_id' => $owner->id,
            'company_id' => $company->id,
            'email' => $owner->email,
            'name' => $owner->name,
            'company_name' => $company->name,
            'status' => 'pending',
            'requested_at' => now(),
        ]);

        $admin = Admin::create([
            'name' => 'Platform Admin',
            'email' => 'admin-se@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $this->actingAs($admin, 'admin')
            ->post(route('admin.sales-engine.access-requests.approve', $accessRequest), [
                'admin_notes' => 'Approved for pilot.',
            ])
            ->assertRedirect(route('admin.sales-engine.access-requests.show', $accessRequest));

        $accessRequest->refresh();
        $this->assertSame('approved', $accessRequest->status);
        $this->assertSame($admin->id, $accessRequest->reviewed_by_admin_id);
        $this->assertNotNull($accessRequest->reviewed_at);

        Http::assertSent(function ($request) use ($owner, $company) {
            return $request->url() === 'https://se.test/api/v1/auth/factory23/provision'
                && $request->hasHeader('X-Internal-Token', 'test-internal-token')
                && $request['sub'] === (string) $owner->id
                && $request['email'] === $owner->email
                && $request['company_id'] === (string) $company->id;
        });
    }

    public function test_admin_can_decline_access_request(): void
    {
        ['user' => $owner] = $this->createCompanyWithOwner();

        $accessRequest = SalesEngineAccessRequest::query()->create([
            'user_id' => $owner->id,
            'email' => $owner->email,
            'name' => $owner->name,
            'status' => 'pending',
            'requested_at' => now(),
        ]);

        $admin = Admin::create([
            'name' => 'Platform Admin',
            'email' => 'admin-decline@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $this->actingAs($admin, 'admin')
            ->post(route('admin.sales-engine.access-requests.decline', $accessRequest), [
                'admin_notes' => 'Not on plan yet.',
            ])
            ->assertRedirect(route('admin.sales-engine.access-requests.show', $accessRequest));

        $accessRequest->refresh();
        $this->assertSame('declined', $accessRequest->status);

        $this->withToken($this->ownerToken($owner))
            ->getJson('/api/v1/admin/sales-engine/access-requests/status')
            ->assertOk()
            ->assertJsonPath('data.status', 'declined');
    }

    public function test_approve_fails_when_sales_engine_provision_errors(): void
    {
        Http::fake([
            'se.test/api/v1/auth/factory23/provision' => Http::response([
                'message' => 'Unauthorized.',
            ], 401),
        ]);

        ['user' => $owner] = $this->createCompanyWithOwner();

        $accessRequest = SalesEngineAccessRequest::query()->create([
            'user_id' => $owner->id,
            'email' => $owner->email,
            'name' => $owner->name,
            'status' => 'pending',
            'requested_at' => now(),
        ]);

        $admin = Admin::create([
            'name' => 'Platform Admin',
            'email' => 'admin-fail@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $this->actingAs($admin, 'admin')
            ->from(route('admin.sales-engine.access-requests.show', $accessRequest))
            ->post(route('admin.sales-engine.access-requests.approve', $accessRequest))
            ->assertRedirect()
            ->assertSessionHasErrors('approve');

        $this->assertSame('pending', $accessRequest->fresh()->status);
    }
}
