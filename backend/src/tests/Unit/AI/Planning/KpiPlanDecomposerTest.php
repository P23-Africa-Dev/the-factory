<?php

declare(strict_types=1);

namespace Tests\Unit\AI\Planning;

use App\Enums\KpiCategory;
use App\Enums\KpiPriority;
use App\Enums\KpiStatus;
use App\Models\Company;
use App\Models\Kpi;
use App\Models\User;
use App\Services\AI\Planning\KpiPlanDecomposer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

final class KpiPlanDecomposerTest extends TestCase
{
    use RefreshDatabase;

    public function test_fifty_visits_over_five_days_splits_into_three_chunks_today(): void
    {
        [$company, $agent] = $this->seedCompanyAndAgent();

        $kpi = Kpi::create([
            'company_id' => $company->id,
            'created_by_user_id' => $agent->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Retail Visits',
            'category' => KpiCategory::CUSTOMER_VISITS->value,
            'objective' => 'Complete 50 retailer visits',
            'target_value' => '50 visits',
            'expected_outcome' => 'Coverage',
            'priority' => KpiPriority::HIGH->value,
            'status' => KpiStatus::IN_PROGRESS->value,
            'start_date' => now()->subDays(10)->toDateString(),
            'end_date' => now()->addDays(4)->toDateString(),
        ]);

        $decomposer = app(KpiPlanDecomposer::class);
        $chunks = $decomposer->decomposeForToday(
            $kpi,
            60.0,
            ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        );

        $this->assertCount(3, $chunks);
        $this->assertSame(10, array_sum(array_column($chunks, 'kpi_chunk_amount')));
        $this->assertSame('kpi', $chunks[0]['parent_entity_type']);
        $this->assertSame((int) $kpi->id, $chunks[0]['parent_entity_id']);

        foreach ($chunks as $index => $chunk) {
            $this->assertSame($index + 1, $chunk['kpi_chunk_index']);
            $this->assertSame(3, $chunk['kpi_chunk_total']);
            $this->assertNotEmpty($chunk['kpi_dedupe_key']);
        }
    }

    public function test_unparseable_target_falls_back_to_single_task(): void
    {
        [$company, $agent] = $this->seedCompanyAndAgent();

        $kpi = Kpi::create([
            'company_id' => $company->id,
            'created_by_user_id' => $agent->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Brand Awareness',
            'category' => KpiCategory::SURVEY->value,
            'objective' => 'Increase awareness',
            'target_value' => 'High',
            'expected_outcome' => 'Awareness',
            'priority' => KpiPriority::MEDIUM->value,
            'status' => KpiStatus::IN_PROGRESS->value,
            'start_date' => now()->subDay()->toDateString(),
            'end_date' => now()->addDays(7)->toDateString(),
        ]);

        $chunks = app(KpiPlanDecomposer::class)->decomposeForToday($kpi, 50.0, null);

        $this->assertCount(1, $chunks);
        $this->assertSame(1, $chunks[0]['kpi_chunk_amount']);
    }

    /**
     * @return array{0: Company, 1: User}
     */
    private function seedCompanyAndAgent(): array
    {
        $company = Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'KPI Co ' . Str::upper(Str::random(4)),
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Operations management',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        /** @var User $agent */
        $agent = User::factory()->createOne(['internal_role' => 'agent']);
        $company->users()->attach($agent->id, ['role' => 'agent', 'joined_at' => now()]);

        return [$company, $agent];
    }
}
