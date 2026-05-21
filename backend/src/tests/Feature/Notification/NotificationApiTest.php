<?php

declare(strict_types=1);

namespace Tests\Feature\Notification;

use App\Models\AppNotification;
use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class NotificationApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_list_and_mark_notifications_read(): void
    {
        [$company, $owner] = $this->seedOwnerContext();

        AppNotification::query()->create([
            'user_id' => $owner->id,
            'company_id' => $company->id,
            'type' => 'task.assigned',
            'category' => 'task',
            'title' => 'New assignment',
            'message' => 'A task was assigned to you.',
            'priority' => 'high',
            'delivery_types' => ['in_app'],
            'is_in_app_visible' => true,
            'is_read' => false,
        ]);

        $alreadyRead = AppNotification::query()->create([
            'user_id' => $owner->id,
            'company_id' => $company->id,
            'type' => 'task.status_changed',
            'category' => 'task',
            'title' => 'Status updated',
            'message' => 'Task status changed.',
            'priority' => 'normal',
            'delivery_types' => ['in_app'],
            'is_in_app_visible' => true,
            'is_read' => true,
            'read_at' => now(),
        ]);

        $token = $owner->createToken('owner-token', ['*'])->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/notifications/unread-count?company_id=' . $company->id)
            ->assertOk()
            ->assertJsonPath('data.unread_count', 1);

        $listResponse = $this->withToken($token)
            ->getJson('/api/v1/notifications?company_id=' . $company->id)
            ->assertOk();

        $notificationId = (int) data_get($listResponse->json(), 'data.items.0.id');

        $this->withToken($token)
            ->patchJson('/api/v1/notifications/read', [
                'company_id' => $company->id,
                'notification_ids' => [$notificationId],
            ])
            ->assertOk()
            ->assertJsonPath('data.updated', 1);

        $this->withToken($token)
            ->getJson('/api/v1/notifications/unread-count?company_id=' . $company->id)
            ->assertOk()
            ->assertJsonPath('data.unread_count', 0);

        $this->assertDatabaseHas('app_notifications', [
            'id' => $alreadyRead->id,
            'is_read' => true,
        ]);
    }

    public function test_notifications_endpoint_rejects_company_context_user_does_not_belong_to(): void
    {
        [, $owner] = $this->seedOwnerContext();

        $otherCompany = Company::query()->create([
            'company_id' => 'FAC-OTHER01',
            'name' => 'Other Co',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '1-10',
            'use_case' => 'other',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $token = $owner->createToken('owner-token', ['*'])->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/notifications/unread-count?company_id=' . $otherCompany->id)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['company_id']);
    }

    public function test_task_creation_generates_in_app_assignment_notification(): void
    {
        [$company, $owner, $agent] = $this->seedOwnerAndAgentContext();

        $ownerToken = $owner->createToken('owner-token', ['*'])->plainTextToken;

        $this->withToken($ownerToken)
            ->postJson('/api/v1/tasks', [
                'company_id' => $company->id,
                'title' => 'Notification Trigger Task',
                'description' => 'Ensure task assignment creates app notifications.',
                'assigned_agent_id' => $agent->id,
                'due_date' => now()->addDay()->toISOString(),
            ])
            ->assertCreated();

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $agent->id,
            'company_id' => $company->id,
            'type' => 'task.assigned',
            'category' => 'task',
            'is_in_app_visible' => true,
        ]);
    }

    private function seedOwnerContext(): array
    {
        $owner = User::factory()->create(['email_verified_at' => now()]);

        $company = Company::query()->create([
            'company_id' => 'FAC-TST001',
            'name' => 'Factory Test Company',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'operations',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $owner->id,
            'role' => 'owner',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [$company, $owner];
    }

    private function seedOwnerAndAgentContext(): array
    {
        [$company, $owner] = $this->seedOwnerContext();

        $agent = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [$company, $owner, $agent];
    }
}
