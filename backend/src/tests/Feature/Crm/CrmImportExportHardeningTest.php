<?php

declare(strict_types=1);

namespace Tests\Feature\Crm;

use App\Models\Company;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CrmImportExportHardeningTest extends TestCase
{
    use RefreshDatabase;

    public function test_overlong_cell_fails_only_that_row(): void
    {
        [$company, $admin, $pipelineId] = $this->seed_();

        $this->withToken($this->token($admin))->postJson('/api/v1/crm/leads/import', [
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'duplicate_policy' => 'create',
            'rows' => [
                ['name' => 'Good One', 'email' => 'good1@example.com'],
                ['name' => 'Too Long', 'position' => str_repeat('x', 121)],
                ['name' => 'Good Two', 'email' => 'good2@example.com'],
            ],
        ])->assertOk()
            ->assertJsonPath('data.imported_count', 2)
            ->assertJsonPath('data.failed_rows.0.row_index', 2);

        $this->assertSame(2, Lead::query()->where('company_id', $company->id)->count());
    }

    public function test_in_file_duplicates_are_skipped_and_previewed(): void
    {
        [$company, $admin, $pipelineId] = $this->seed_();
        $rows = [
            ['name' => 'Ada', 'email' => 'ada@example.com'],
            ['name' => 'Ada Again', 'email' => 'ADA@example.com'],
        ];

        $this->withToken($this->token($admin))->postJson('/api/v1/crm/leads/import/preview', [
            'company_id' => $company->id, 'pipeline_id' => $pipelineId, 'duplicate_policy' => 'skip', 'rows' => $rows,
        ])->assertOk()->assertJsonPath('data.duplicate_count', 1)->assertJsonPath('data.duplicate_rows.0.row_index', 2);

        $this->withToken($this->token($admin))->postJson('/api/v1/crm/leads/import', [
            'company_id' => $company->id, 'pipeline_id' => $pipelineId, 'duplicate_policy' => 'skip', 'rows' => $rows,
        ])->assertOk()
            ->assertJsonPath('data.imported_count', 1)
            ->assertJsonPath('data.skipped_rows.0.row_index', 2);
    }

    public function test_industry_and_company_email_import_and_row_offset_numbering(): void
    {
        [$company, $admin, $pipelineId] = $this->seed_();

        $this->withToken($this->token($admin))->postJson('/api/v1/crm/leads/import', [
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'duplicate_policy' => 'create',
            'row_offset' => 500,
            'rows' => [
                ['name' => 'Imported Co', 'industry' => 'Logistics & Fleet', 'company_email' => 'hello@imported.example'],
                ['name' => 'Bad Email', 'company_email' => 'not-an-email'],
            ],
        ])->assertOk()
            ->assertJsonPath('data.imported_count', 1)
            ->assertJsonPath('data.failed_rows.0.row_index', 502);

        $lead = Lead::query()->where('name', 'Imported Co')->firstOrFail();
        $this->assertSame('Logistics & Fleet', $lead->industry);
        $this->assertSame('hello@imported.example', $lead->company_email);
    }

    public function test_import_sends_one_summary_notification_instead_of_one_per_lead(): void
    {
        [$company, $admin, $pipelineId] = $this->seed_();

        $this->withToken($this->token($admin))->postJson('/api/v1/crm/leads/import', [
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'duplicate_policy' => 'create',
            'rows' => array_map(static fn(int $i): array => ['name' => "Bulk {$i}"], range(1, 5)),
        ])->assertOk()->assertJsonPath('data.imported_count', 5);

        $this->assertSame(0, DB::table('app_notifications')->where('type', 'crm.lead_created')->count());
        $this->assertSame(1, DB::table('app_notifications')->where('type', 'crm.leads_imported')->where('user_id', $admin->id)->count());
    }

    public function test_export_has_new_columns_and_honours_creator_and_industry_filters(): void
    {
        [$company, $admin, $pipelineId] = $this->seed_();
        $token = $this->token($admin);

        foreach ([['Fin Lead', 'Fintech & Payments'], ['Edu Lead', 'Education']] as [$name, $industry]) {
            $this->withToken($token)->postJson('/api/v1/crm/leads', [
                'company_id' => $company->id, 'pipeline_id' => $pipelineId, 'name' => $name, 'industry' => $industry,
            ])->assertCreated();
        }

        $content = $this->withToken($token)
            ->get('/api/v1/crm/leads/export?company_id=' . $company->id . '&format=csv&industry=' . urlencode('Fintech & Payments') . '&created_by_user_id=' . $admin->id)
            ->assertOk()
            ->streamedContent();

        $lines = array_values(array_filter(explode("\n", trim(ltrim($content, "\xEF\xBB\xBF")))));
        $header = str_getcsv($lines[0]);
        $this->assertContains('Lead ID', $header);
        $this->assertContains('Industry', $header);
        $this->assertContains('Company Email', $header);
        $this->assertContains('Created By', $header);
        $this->assertCount(2, $lines, 'header + 1 filtered row');
        $row = array_combine($header, str_getcsv($lines[1]));
        $this->assertSame('Fin Lead', $row['Name']);
        $this->assertSame('Fintech & Payments', $row['Industry']);
        $this->assertSame($admin->name, $row['Created By']);
    }

    public function test_update_policy_with_profile_url_list_updates_instead_of_failing(): void
    {
        [$company, $admin, $pipelineId] = $this->seed_();
        $rows = [[
            'name' => 'Faith Dove',
            'email' => 'faith@example.com',
            'industry' => 'Logistics & Fleet',
            'profile_urls' => ['https://linkedin.com/in/faith', 'https://x.com/faith'],
        ]];

        $import = fn (array $rows) => $this->withToken($this->token($admin))->postJson('/api/v1/crm/leads/import', [
            'company_id' => $company->id, 'pipeline_id' => $pipelineId, 'duplicate_policy' => 'update', 'rows' => $rows,
        ]);

        $import($rows)->assertOk()->assertJsonPath('data.imported_count', 1);
        $rows[0]['company_email'] = 'hello@dove.example';
        // Matching an existing lead used to throw "Array to string conversion" on profile_urls.
        $import($rows)->assertOk()
            ->assertJsonPath('data.updated_count', 1)
            ->assertJsonPath('data.failed_rows', []);

        $lead = Lead::query()->where('email', 'faith@example.com')->firstOrFail();
        $this->assertSame('hello@dove.example', $lead->company_email);
        $this->assertSame('Logistics & Fleet', $lead->industry);
    }

    public function test_failed_rows_say_which_field_to_fix(): void
    {
        [$company, $admin, $pipelineId] = $this->seed_();

        $this->withToken($this->token($admin))->postJson('/api/v1/crm/leads/import', [
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'duplicate_policy' => 'create',
            'rows' => [[
                'name' => 'Faith Dove',
                'email' => 'faith@',
                'priority' => 'asap',
                'budget_amount' => 'lots',
                'status' => 'Not A Stage',
            ]],
        ])->assertOk()
            ->assertJsonPath('data.failed_rows.0.field_errors.email', "Email 'faith@' is not a valid email address.")
            ->assertJsonStructure(['data' => ['failed_rows' => [['field_errors' => ['priority', 'budget_amount', 'status']]]]]);
    }

    private function token(User $user): string
    {
        return $user->createToken('t', ['*'])->plainTextToken;
    }

    /** @return array{0: Company, 1: User, 2: int} */
    private function seed_(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-IMPEXP', 'name' => 'Import Export Ltd', 'country' => 'NG',
            'team_size' => '11-50', 'use_case' => 'CRM', 'status' => 'active', 'activated_at' => now(),
        ]);
        $admin = User::factory()->create(['email_verified_at' => now()]);
        DB::table('company_users')->insert([
            'company_id' => $company->id, 'user_id' => $admin->id, 'role' => 'admin',
            'joined_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        $pipeline = LeadPipeline::query()->create([
            'company_id' => $company->id, 'name' => 'Default Pipeline', 'currency_code' => 'USD',
            'sort_order' => 0, 'is_default' => true,
        ]);

        return [$company, $admin, (int) $pipeline->id];
    }
}
