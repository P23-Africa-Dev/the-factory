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

/**
 * Pipeline currency is choosable; delete asks for confirmation before moving leads.
 */
class CrmPipelineCurrencyDeleteTest extends TestCase
{
    use RefreshDatabase;

    public function test_pipeline_can_be_created_and_updated_with_currency(): void
    {
        [$company, $admin] = $this->seed_();

        $id = (int) $this->withToken($this->token($admin))
            ->postJson('/api/v1/crm/pipelines', [
                'company_id' => $company->id,
                'name' => 'Naira Pipeline',
                'currency_code' => 'NGN',
            ])
            ->assertCreated()
            ->assertJsonPath('data.pipeline.currency_code', 'NGN')
            ->json('data.pipeline.id');

        $this->withToken($this->token($admin))
            ->patchJson("/api/v1/crm/pipelines/{$id}", [
                'company_id' => $company->id,
                'currency_code' => 'KES',
            ])
            ->assertOk()
            ->assertJsonPath('data.pipeline.currency_code', 'KES');
    }

    public function test_delete_without_force_reports_usage_then_force_moves_to_chosen_pipeline(): void
    {
        [$company, $admin, $defaultId, $otherId] = $this->seedWithTwoPipelines();

        Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $otherId,
            'created_by_user_id' => $admin->id,
            'name' => 'Pipeline Lead',
            'status' => 'newly_lead',
            'source' => 'manual',
        ]);

        $this->withToken($this->token($admin))
            ->postJson("/api/v1/crm/pipelines/{$otherId}/delete", [
                'company_id' => $company->id,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['pipeline', 'pipeline_usage_count']);

        $this->withToken($this->token($admin))
            ->postJson("/api/v1/crm/pipelines/{$otherId}/delete", [
                'company_id' => $company->id,
                'force' => true,
                'reassign_to_pipeline_id' => $defaultId,
            ])
            ->assertOk()
            ->assertJsonPath('data.reassigned_leads_count', 1)
            ->assertJsonPath('data.reassigned_to_pipeline_id', $defaultId);

        $this->assertSame($defaultId, (int) Lead::query()->firstOrFail()->pipeline_id);
        $this->assertNull(LeadPipeline::query()->find($otherId));
    }

    private function token(User $user): string
    {
        return $user->createToken('test', ['*'])->plainTextToken;
    }

    /** @return array{0: Company, 1: User} */
    private function seed_(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-PIPE-CUR',
            'name' => 'Pipeline Currency Ltd',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'CRM',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $admin = User::factory()->create(['email_verified_at' => now()]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $admin->id,
            'role' => 'admin',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        LeadPipeline::query()->create([
            'company_id' => $company->id,
            'name' => 'Default Pipeline',
            'currency_code' => 'USD',
            'sort_order' => 0,
            'is_default' => true,
        ]);

        return [$company, $admin];
    }

    /** @return array{0: Company, 1: User, 2: int, 3: int} */
    private function seedWithTwoPipelines(): array
    {
        [$company, $admin] = $this->seed_();

        $defaultId = (int) LeadPipeline::query()
            ->where('company_id', $company->id)
            ->where('is_default', true)
            ->value('id');

        $otherId = (int) LeadPipeline::query()->create([
            'company_id' => $company->id,
            'name' => 'Secondary',
            'currency_code' => 'USD',
            'sort_order' => 1,
            'is_default' => false,
        ])->id;

        return [$company, $admin, $defaultId, $otherId];
    }
}
