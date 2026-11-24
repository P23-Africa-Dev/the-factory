<?php

declare(strict_types=1);

namespace Tests\Feature\Drive;

use App\Models\Company;
use App\Models\DriveFile;
use App\Models\User;
use App\Services\Drive\CompanyDriveService;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use League\Flysystem\UnableToCheckFileExistence;
use Mockery;
use Tests\TestCase;

/**
 * Drive must answer clearly when storage misbehaves (missing objects, a
 * rejected access key) and ELY-generated files must expire.
 */
class DriveStorageResilienceTest extends TestCase
{
    use RefreshDatabase;

    public function test_preview_of_a_missing_object_is_404_not_500(): void
    {
        Storage::fake('drive');
        [$company, $owner] = $this->seedCompany();
        $fileId = $this->upload($owner, $company);
        Storage::disk('drive')->delete(DriveFile::query()->findOrFail($fileId)->file_path);

        $this->actingAs($owner, 'sanctum')
            ->get("/api/v1/drive/files/{$fileId}/download?company_id={$company->id}")
            ->assertNotFound()
            ->assertJsonPath('message', 'This file is no longer available.');
    }

    public function test_delete_of_a_missing_object_still_removes_the_file(): void
    {
        Storage::fake('drive');
        [$company, $owner] = $this->seedCompany();
        $fileId = $this->upload($owner, $company);
        Storage::disk('drive')->delete(DriveFile::query()->findOrFail($fileId)->file_path);

        $this->actingAs($owner, 'sanctum')
            ->deleteJson("/api/v1/drive/files/{$fileId}?company_id={$company->id}")
            ->assertSuccessful();

        $this->assertDatabaseMissing('drive_files', ['id' => $fileId]);
    }

    public function test_storage_outage_is_503_and_keeps_the_file(): void
    {
        Storage::fake('drive');
        [$company, $owner] = $this->seedCompany();
        $fileId = $this->upload($owner, $company);

        // Simulate Spaces rejecting the access key.
        $broken = Mockery::mock(FilesystemAdapter::class);
        $broken->shouldReceive('fileExists')->andThrow(UnableToCheckFileExistence::forLocation('x'));
        $broken->shouldReceive('delete')->andReturn(false);
        Storage::set('drive', $broken);

        $this->actingAs($owner, 'sanctum')
            ->get("/api/v1/drive/files/{$fileId}/download?company_id={$company->id}")
            ->assertStatus(503)
            ->assertJsonPath('message', 'Drive storage is unavailable right now. Please try again later.');

        $this->actingAs($owner, 'sanctum')
            ->deleteJson("/api/v1/drive/files/{$fileId}?company_id={$company->id}")
            ->assertStatus(503);

        $this->assertDatabaseHas('drive_files', ['id' => $fileId]);
    }

    public function test_ely_reports_expire_and_only_they_are_pruned(): void
    {
        Storage::fake('drive');
        [$company, $owner] = $this->seedCompany();
        $uploadId = $this->upload($owner, $company);

        $report = app(CompanyDriveService::class)->archiveElyReport($owner, 'rep-1', 'Weekly.pdf', '%PDF-1.4 test', (int) $company->id);
        $reportFile = DriveFile::query()->where('ely_report_id', 'rep-1')->firstOrFail();

        $this->assertNotNull($reportFile->expires_at);
        $this->assertSame(60, (int) round(now()->diffInDays($reportFile->expires_at)));
        $this->assertNull(DriveFile::query()->findOrFail($uploadId)->expires_at);

        // The API shows when it will be removed.
        $items = $this->actingAs($owner, 'sanctum')
            ->getJson("/api/v1/drive/files?company_id={$company->id}&folder_id={$reportFile->folder_id}")
            ->assertOk()->json('data.items');
        $listed = collect($items)->keyBy('id');
        $this->assertSame($reportFile->expires_at->toIso8601String(), $listed[$reportFile->id]['expires_at']);
        $this->assertNull($listed[$uploadId]['expires_at']);

        $this->travel(61)->days();
        $this->artisan('drive:prune-expired')->assertSuccessful();

        $this->assertDatabaseMissing('drive_files', ['id' => $reportFile->id]);
        Storage::disk('drive')->assertMissing($reportFile->file_path);
        $this->assertDatabaseHas('drive_files', ['id' => $uploadId]);
        $this->assertIsArray($report);
    }

    public function test_make_private_sets_every_stored_file_private(): void
    {
        Storage::fake('drive');
        [$company, $owner] = $this->seedCompany();
        $fileId = $this->upload($owner, $company);
        $path = DriveFile::query()->findOrFail($fileId)->file_path;

        $disk = Mockery::mock(FilesystemAdapter::class);
        $disk->shouldReceive('fileExists')->with($path)->andReturnTrue();
        $disk->shouldReceive('setVisibility')->once()->with($path, 'private')->andReturnTrue();
        Storage::set('drive', $disk);

        $this->artisan('drive:make-private')->assertSuccessful();
    }

    public function test_failed_write_creates_no_report_row(): void
    {
        Storage::fake('drive');
        [$company, $owner] = $this->seedCompany();
        // Listing folders creates the ELY Reports folder.
        $this->actingAs($owner, 'sanctum')->getJson('/api/v1/drive/folders?company_id='.$company->id)->assertOk();

        $broken = Mockery::mock(FilesystemAdapter::class);
        $broken->shouldReceive('put')->andReturn(false);
        Storage::set('drive', $broken);

        try {
            app(CompanyDriveService::class)->archiveElyReport($owner, 'rep-2', 'Weekly.pdf', '%PDF', (int) $company->id);
            $this->fail('A failed write must throw.');
        } catch (\RuntimeException) {
            // expected
        }

        $this->assertDatabaseMissing('drive_files', ['ely_report_id' => 'rep-2']);
    }

    private function upload(User $owner, Company $company): int
    {
        $folders = $this->actingAs($owner, 'sanctum')->getJson('/api/v1/drive/folders?company_id='.$company->id)->assertOk();
        $folderId = (int) collect($folders->json('data.items'))->firstWhere('system_key', 'ely_reports')['id'];

        return (int) $this->actingAs($owner, 'sanctum')->post('/api/v1/drive/files', [
            'company_id' => $company->id,
            'folder_id' => $folderId,
            'file' => UploadedFile::fake()->create('policy.pdf', 20, 'application/pdf'),
        ])->assertCreated()->json('data.id');
    }

    /**
     * @return array{0: Company, 1: User}
     */
    private function seedCompany(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-DRS-'.strtoupper((string) fake()->lexify('????')),
            'name' => 'Drive Resilience Co',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'Drive testing',
            'status' => 'active',
            'activated_at' => now(),
            'subscription_plan_key' => 'up_to_5',
        ]);
        $owner = User::factory()->create(['internal_role' => null, 'is_active' => true]);
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
}
