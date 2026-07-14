<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

final class CopilotDriveFilesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('drive');
        Notification::fake();
        config([
            'services.ai.enable_read_synthesis' => false,
            'services.ai.enable_hybrid_router' => false,
            'services.ai.pii_redaction_enabled' => false,
        ]);
    }

    public function test_management_can_find_drive_files_via_ely(): void
    {
        [$company, $owner] = $this->seedCompany();
        $folderId = $this->elyFolderId($owner, $company);

        $this->uploadFile($owner, $company, $folderId, 'quarterly-plan.txt', 'Q3 field expansion plan.');

        $response = $this
            ->actingAs($owner)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'What files do I have in the company drive?',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'drive.files');

        $names = collect($response->json('data.response.payload.items'))
            ->pluck('name')
            ->all();

        $this->assertContains('quarterly-plan.txt', $names);
    }

    public function test_generic_list_phrasings_do_not_leak_filler_words_as_filters(): void
    {
        [$company, $owner] = $this->seedCompany();
        $folderId = $this->elyFolderId($owner, $company);

        $this->uploadFile($owner, $company, $folderId, 'alpha-report.txt', 'Alpha.');
        $this->uploadFile($owner, $company, $folderId, 'beta-notes.txt', 'Beta.');
        $this->uploadFile($owner, $company, $folderId, 'gamma-plan.txt', 'Gamma.');

        foreach (['List out the 3 documents in my drive', 'List the documents in my drive'] as $message) {
            $response = $this
                ->actingAs($owner)
                ->postJson('/api/v1/copilot/chat', [
                    'company_id' => $company->id,
                    'message' => $message,
                ]);

            $response
                ->assertOk()
                ->assertJsonPath('data.response.tool', 'drive.files');

            $payload = $response->json('data.response.payload');
            $this->assertArrayNotHasKey('search', is_array($payload) ? $payload : ['search' => true], "Filler filter leaked for: {$message}");

            $names = collect($response->json('data.response.payload.items'))->pluck('name')->all();
            $this->assertContains('alpha-report.txt', $names, "Missing file for: {$message}");
            $this->assertContains('beta-notes.txt', $names, "Missing file for: {$message}");
            $this->assertContains('gamma-plan.txt', $names, "Missing file for: {$message}");
        }
    }

    public function test_management_can_ask_a_question_answered_from_file_contents(): void
    {
        [$company, $owner] = $this->seedCompany();
        $folderId = $this->elyFolderId($owner, $company);

        $this->uploadFile(
            $owner,
            $company,
            $folderId,
            'refund-policy.txt',
            'Our refund policy allows customers to return items within 30 days for a full refund.',
        );

        $response = $this
            ->actingAs($owner)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Summarize the refund policy document',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'drive.files')
            ->assertJsonPath('data.response.payload.file_name', 'refund-policy.txt')
            ->assertJsonPath('data.response.payload.answered_from_file', true);

        $fileContent = (string) $response->json('data.response.payload.file_content');
        $this->assertStringContainsString('30 days', $fileContent);
    }

    public function test_agent_only_sees_files_granted_to_them(): void
    {
        [$company, $owner, $agent] = $this->seedCompany(withAgent: true);
        $folderId = $this->elyFolderId($owner, $company);

        $this->uploadFile($owner, $company, $folderId, 'shared-guide.txt', 'Onboarding guide for new agents.', [$agent->id]);
        $this->uploadFile($owner, $company, $folderId, 'secret-plan.txt', 'Confidential leadership strategy.');

        $response = $this
            ->actingAs($agent)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'List the files in the company drive',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'drive.files');

        $names = collect($response->json('data.response.payload.items'))
            ->pluck('name')
            ->all();

        $this->assertContains('shared-guide.txt', $names);
        $this->assertNotContains('secret-plan.txt', $names);
    }

    public function test_agent_cannot_get_contents_of_ungranted_file(): void
    {
        [$company, $owner, $agent] = $this->seedCompany(withAgent: true);
        $folderId = $this->elyFolderId($owner, $company);

        $this->uploadFile($owner, $company, $folderId, 'secret-plan.txt', 'Confidential leadership strategy for the year.');

        $response = $this
            ->actingAs($agent)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Summarize the secret plan document',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'drive.files');

        $payload = $response->json('data.response.payload');
        $this->assertArrayNotHasKey('file_content', is_array($payload) ? $payload : []);
        $this->assertEmpty($response->json('data.response.payload.items'));
    }

    public function test_agent_can_get_contents_of_a_granted_file(): void
    {
        [$company, $owner, $agent] = $this->seedCompany(withAgent: true);
        $folderId = $this->elyFolderId($owner, $company);

        $this->uploadFile(
            $owner,
            $company,
            $folderId,
            'onboarding-guide.txt',
            'New agents must complete safety training in the first week.',
            [$agent->id],
        );

        $response = $this
            ->actingAs($agent)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'According to the onboarding guide document, what must new agents do?',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'drive.files')
            ->assertJsonPath('data.response.payload.answered_from_file', true);

        $fileContent = (string) $response->json('data.response.payload.file_content');
        $this->assertStringContainsString('safety training', $fileContent);
    }

    private function uploadFile(
        User $actor,
        Company $company,
        int $folderId,
        string $name,
        string $content,
        array $userIds = [],
    ): int {
        $payload = [
            'company_id' => $company->id,
            'folder_id' => $folderId,
            'file' => UploadedFile::fake()->createWithContent($name, $content),
        ];

        if ($userIds !== []) {
            $payload['user_ids'] = $userIds;
        }

        $upload = $this->actingAs($actor, 'sanctum')
            ->post('/api/v1/drive/files', $payload)
            ->assertCreated();

        return (int) $upload->json('data.id');
    }

    /**
     * @return array{0: Company, 1: User, 2?: User}
     */
    private function seedCompany(bool $withAgent = false): array
    {
        $company = Company::query()->create([
            'company_id' => 'FAC-ELY-' . strtoupper((string) fake()->lexify('????')),
            'name' => 'Drive Intelligence Co',
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
            ->getJson('/api/v1/drive/folders?company_id=' . $company->id)
            ->assertOk();

        return (int) collect($response->json('data.items'))
            ->firstWhere('system_key', 'ely_reports')['id'];
    }
}
