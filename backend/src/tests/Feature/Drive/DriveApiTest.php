<?php

declare(strict_types=1);

namespace Tests\Feature\Drive;

use App\Models\AppNotification;
use App\Models\Company;
use App\Models\DriveFile;
use App\Models\DriveFolder;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class DriveApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_management_can_upload_and_list_drive_file(): void
    {
        [$company, $owner] = $this->seedCompany();

        $folderResponse = $this->actingAs($owner, 'sanctum')
            ->getJson('/api/v1/drive/folders?company_id=' . $company->id);

        $folderResponse->assertOk();
        $elyFolderId = collect($folderResponse->json('data.items'))
            ->firstWhere('system_key', 'ely_reports')['id'];

        $upload = $this->actingAs($owner, 'sanctum')
            ->post('/api/v1/drive/files', [
                'company_id' => $company->id,
                'folder_id' => $elyFolderId,
                'file' => UploadedFile::fake()->create('policy.pdf', 120, 'application/pdf'),
            ]);

        $upload->assertCreated()
            ->assertJsonPath('data.original_name', 'policy.pdf');

        $fileId = (int) $upload->json('data.id');

        $list = $this->actingAs($owner, 'sanctum')
            ->getJson('/api/v1/drive/files?company_id=' . $company->id . '&folder_id=' . $elyFolderId);

        $list->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.id', $fileId);

        Storage::disk('drive')->assertExists(DriveFile::query()->findOrFail($fileId)->file_path);
    }

    public function test_agent_cannot_upload_drive_file(): void
    {
        [$company, $owner, $agent] = $this->seedCompany(withAgent: true);

        $folderId = $this->elyFolderId($owner, $company);

        $this->actingAs($agent, 'sanctum')
            ->post('/api/v1/drive/files', [
                'company_id' => $company->id,
                'folder_id' => $folderId,
                'file' => UploadedFile::fake()->create('notes.pdf', 50, 'application/pdf'),
            ])
            ->assertStatus(422);
    }

    public function test_agent_with_grant_can_download_shared_file(): void
    {
        Notification::fake();

        [$company, $owner, $agent] = $this->seedCompany(withAgent: true);
        $folderId = $this->elyFolderId($owner, $company);

        $upload = $this->actingAs($owner, 'sanctum')
            ->post('/api/v1/drive/files', [
                'company_id' => $company->id,
                'folder_id' => $folderId,
                'file' => UploadedFile::fake()->create('handbook.pdf', 80, 'application/pdf'),
                'user_ids' => [$agent->id],
            ])
            ->assertCreated();

        $fileId = (int) $upload->json('data.id');

        $this->actingAs($agent, 'sanctum')
            ->getJson('/api/v1/drive/files/' . $fileId . '?company_id=' . $company->id)
            ->assertOk()
            ->assertJsonPath('data.id', $fileId);

        $this->actingAs($agent, 'sanctum')
            ->get('/api/v1/drive/files/' . $fileId . '/download?company_id=' . $company->id)
            ->assertOk();

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $agent->id,
            'type' => 'drive.file_shared',
        ]);
    }

    public function test_agent_without_grant_cannot_access_file(): void
    {
        [$company, $owner, $agent] = $this->seedCompany(withAgent: true);
        $folderId = $this->elyFolderId($owner, $company);

        $upload = $this->actingAs($owner, 'sanctum')
            ->post('/api/v1/drive/files', [
                'company_id' => $company->id,
                'folder_id' => $folderId,
                'file' => UploadedFile::fake()->create('private.pdf', 80, 'application/pdf'),
            ])
            ->assertCreated();

        $fileId = (int) $upload->json('data.id');

        $this->actingAs($agent, 'sanctum')
            ->getJson('/api/v1/drive/files/' . $fileId . '?company_id=' . $company->id)
            ->assertForbidden();
    }

    public function test_system_folder_cannot_be_deleted(): void
    {
        [$company, $owner] = $this->seedCompany();
        $folderId = $this->elyFolderId($owner, $company);

        $this->actingAs($owner, 'sanctum')
            ->deleteJson('/api/v1/drive/folders/' . $folderId . '?company_id=' . $company->id)
            ->assertStatus(422);
    }

    public function test_quota_blocks_upload_when_limit_exceeded(): void
    {
        config(['drive.plan_quotas_gb.up_to_5' => 0.000001]);

        [$company, $owner] = $this->seedCompany();
        $folderId = $this->elyFolderId($owner, $company);

        $this->actingAs($owner, 'sanctum')
            ->post('/api/v1/drive/files', [
                'company_id' => $company->id,
                'folder_id' => $folderId,
                'file' => UploadedFile::fake()->create('large.pdf', 2000, 'application/pdf'),
            ])
            ->assertStatus(422);
    }

    /**
     * @return array{0: Company, 1: User, 2?: User}
     */
    private function seedCompany(bool $withAgent = false): array
    {
        $company = Company::create([
            'company_id' => 'FAC-DRV-' . strtoupper((string) fake()->lexify('????')),
            'name' => 'Drive Co',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'Drive testing',
            'status' => 'active',
            'activated_at' => now(),
            'subscription_plan_key' => 'up_to_5',
        ]);

        $owner = User::factory()->create(['internal_role' => null, 'is_active' => true]);
        $rows = [[
            'company_id' => $company->id,
            'user_id' => $owner->id,
            'role' => 'owner',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]];

        $agent = null;
        if ($withAgent) {
            $agent = User::factory()->create(['internal_role' => 'agent', 'is_active' => true]);
            $rows[] = [
                'company_id' => $company->id,
                'user_id' => $agent->id,
                'role' => 'agent',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }

        DB::table('company_users')->insert($rows);

        return $withAgent ? [$company, $owner, $agent] : [$company, $owner];
    }

    private function elyFolderId(User $owner, Company $company): int
    {
        $response = $this->actingAs($owner, 'sanctum')
            ->getJson('/api/v1/drive/folders?company_id=' . $company->id);

        $response->assertOk();

        return (int) collect($response->json('data.items'))
            ->firstWhere('system_key', 'ely_reports')['id'];
    }
}
