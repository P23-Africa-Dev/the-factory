<?php

declare(strict_types=1);

namespace Tests\Feature\Crm;

use App\Models\Company;
use App\Models\Lead;
use App\Models\LeadLabel;
use App\Models\LeadPipeline;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Lead board stage moves: any stage, any direction, and reads never rewrite leads.
 */
class CrmBoardStageTest extends TestCase
{
    use RefreshDatabase;

    public function test_lead_can_move_into_stage_with_long_name_and_back(): void
    {
        [$company, $admin, $pipelineId] = $this->seed_();
        $longName = str_repeat('Negotiation and contract review ', 3); // > 40 chars

        $labelSlug = $this->withToken($this->token($admin))
            ->postJson('/api/v1/crm/labels', ['company_id' => $company->id, 'name' => $longName, 'color' => '#123456'])
            ->assertCreated()
            ->json('data.label.slug');
        $this->assertGreaterThan(40, strlen((string) $labelSlug));

        $leadId = $this->createLead($company, $admin, $pipelineId);

        foreach ([$labelSlug, 'newly_lead', 'qualified', 'newly_lead'] as $target) {
            $this->withToken($this->token($admin))
                ->patchJson("/api/v1/crm/leads/{$leadId}", ['company_id' => $company->id, 'status' => $target])
                ->assertOk()
                ->assertJsonPath('data.lead.status', $target);
        }
    }

    public function test_user_created_stage_named_new_is_not_rewritten_on_read(): void
    {
        [$company, $admin, $pipelineId] = $this->seed_();

        $slug = $this->withToken($this->token($admin))
            ->postJson('/api/v1/crm/labels', ['company_id' => $company->id, 'name' => 'New', 'color' => '#123456'])
            ->assertCreated()
            ->json('data.label.slug');
        $this->assertSame('new', $slug);

        $leadId = $this->createLead($company, $admin, $pipelineId);
        $this->withToken($this->token($admin))
            ->patchJson("/api/v1/crm/leads/{$leadId}", ['company_id' => $company->id, 'status' => 'new'])
            ->assertOk();

        // Board read used to bulk-rewrite status "new" -> "newly_lead".
        $this->withToken($this->token($admin))
            ->getJson('/api/v1/crm/leads?company_id=' . $company->id)
            ->assertOk();

        $this->assertSame('new', Lead::query()->findOrFail($leadId)->status);
    }

    public function test_reading_leads_performs_no_lead_writes(): void
    {
        [$company, $admin, $pipelineId] = $this->seed_();
        $this->createLead($company, $admin, $pipelineId);

        $writes = [];
        DB::listen(function ($query) use (&$writes): void {
            if (preg_match('/^\s*(update|insert|delete)\s.*\bleads\b/i', $query->sql)) {
                $writes[] = $query->sql;
            }
        });

        $this->withToken($this->token($admin))
            ->getJson('/api/v1/crm/leads?company_id=' . $company->id)
            ->assertOk();

        $this->assertSame([], $writes);
    }

    public function test_lead_created_without_status_uses_company_default_stage_even_if_newly_lead_deleted(): void
    {
        [$company, $admin, $pipelineId] = $this->seed_();
        // Make sure defaults are seeded, then remove the seeded "New Lead" stage.
        $this->createLead($company, $admin, $pipelineId);
        LeadLabel::query()->where('company_id', $company->id)->where('slug', 'newly_lead')->delete();
        LeadLabel::query()->where('company_id', $company->id)->where('slug', 'contacted')->update(['is_default' => true]);

        $leadId = $this->withToken($this->token($admin))
            ->postJson('/api/v1/crm/leads', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'name' => 'No Status Lead',
            ])
            ->assertCreated()
            ->json('data.lead.id');

        $this->assertSame('contacted', Lead::query()->findOrFail($leadId)->status);
    }

    public function test_label_rules_hex_color_last_label_and_rename_moves_leads(): void
    {
        [$company, $admin, $pipelineId] = $this->seed_();
        $token = $this->token($admin);
        $leadId = $this->createLead($company, $admin, $pipelineId);

        $this->withToken($token)
            ->postJson('/api/v1/crm/labels', ['company_id' => $company->id, 'name' => 'Bad', 'color' => 'red'])
            ->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['color']]);

        // Renaming a stage moves its leads with it.
        $label = LeadLabel::query()->where('company_id', $company->id)->where('slug', 'newly_lead')->firstOrFail();
        $newSlug = $this->withToken($token)
            ->patchJson('/api/v1/crm/labels/' . $label->id, ['company_id' => $company->id, 'name' => 'Fresh Leads'])
            ->assertOk()
            ->json('data.label.slug');
        $this->assertSame($newSlug, Lead::query()->findOrFail($leadId)->status);

        // Delete all but one label; the last one is protected.
        $ids = LeadLabel::query()->where('company_id', $company->id)->orderBy('sort_order')->pluck('id')->all();
        foreach (array_slice($ids, 1) as $id) {
            $this->withToken($token)
                ->postJson('/api/v1/crm/labels/' . $id . '/delete', ['company_id' => $company->id, 'force' => true])
                ->assertOk();
        }
        $this->withToken($token)
            ->postJson('/api/v1/crm/labels/' . $ids[0] . '/delete', ['company_id' => $company->id, 'force' => true])
            ->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['label']]);
    }

    public function test_bulk_delete_reports_partial_failures(): void
    {
        [$company, $admin, $pipelineId] = $this->seed_();
        $a = $this->createLead($company, $admin, $pipelineId);
        $b = $this->createLead($company, $admin, $pipelineId);

        $this->withToken($this->token($admin))
            ->postJson('/api/v1/crm/leads/bulk-delete', ['company_id' => $company->id, 'lead_ids' => [$a, $b, 999999]])
            ->assertOk()
            ->assertJsonPath('data.deleted_ids', [$a, $b])
            ->assertJsonPath('data.failed.0.id', 999999);

        $this->assertNull(Lead::query()->find($a));
    }

    private function createLead(Company $company, User $admin, int $pipelineId): int
    {
        return (int) $this->withToken($this->token($admin))
            ->postJson('/api/v1/crm/leads', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'name' => 'Board Lead ' . uniqid(),
                'status' => 'newly_lead',
            ])
            ->assertCreated()
            ->json('data.lead.id');
    }

    private function token(User $user): string
    {
        return $user->createToken('test', ['*'])->plainTextToken;
    }

    /** @return array{0: Company, 1: User, 2: int} */
    private function seed_(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-CRM-BOARD',
            'name' => 'CRM Board Ltd',
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

        $pipeline = LeadPipeline::query()->create([
            'company_id' => $company->id,
            'name' => 'Default Pipeline',
            'currency_code' => 'USD',
            'sort_order' => 0,
            'is_default' => true,
        ]);

        return [$company, $admin, (int) $pipeline->id];
    }
}
