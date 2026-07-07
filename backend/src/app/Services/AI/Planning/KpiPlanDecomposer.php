<?php

declare(strict_types=1);

namespace App\Services\AI\Planning;

use App\Enums\KpiCategory;
use App\Enums\KpiPriority;
use App\Enums\TaskType;
use App\Models\Kpi;
use Illuminate\Support\Carbon;

final class KpiPlanDecomposer
{
    private const MAX_DAILY_QUOTA = 20;

    private const MAX_CHUNKS = 3;

    /**
     * @param  array<int, string>|null  $workingDays
     * @return array<int, array<string, mixed>>
     */
    public function decomposeForToday(Kpi $kpi, float $baseScore, ?array $workingDays = null): array
    {
        $today = now()->startOfDay();
        $endDate = $kpi->end_date !== null
            ? $kpi->end_date->copy()->startOfDay()
            : $today->copy()->addDays(30);

        if ($endDate->lt($today)) {
            return [];
        }

        $daysRemaining = max(1, $this->countWorkingDaysRemaining($today, $endDate, $workingDays));
        $parsedTarget = $this->parseNumericTarget((string) ($kpi->target_value ?? ''));
        $unitLabel = $this->parseUnitLabel((string) ($kpi->target_value ?? ''), $kpi->category?->value);

        $dailyQuota = $parsedTarget !== null
            ? min(self::MAX_DAILY_QUOTA, (int) ceil($parsedTarget / $daysRemaining))
            : 1;

        $dailyQuota = max(1, $dailyQuota);
        $chunks = $this->splitIntoChunks($dailyQuota, self::MAX_CHUNKS);
        $chunkCount = count($chunks);
        $dateKey = $today->toDateString();
        $kpiId = (int) $kpi->id;
        $parentItemId = (string) \Illuminate\Support\Str::uuid();

        $candidates = [];
        foreach ($chunks as $index => $chunkAmount) {
            $chunkNumber = $index + 1;
            $chunkLabel = $chunkCount > 1
                ? sprintf('%d %s (%d/%d)', $chunkAmount, $unitLabel, $chunkNumber, $chunkCount)
                : sprintf('%d %s today', $chunkAmount, $unitLabel);

            $dedupeKey = hash('sha256', "kpi:{$kpiId}:{$dateKey}:chunk:{$chunkNumber}");

            $candidates[] = [
                'type' => 'kpi',
                'title' => 'KPI: ' . $kpi->name . ' — ' . $chunkLabel,
                'reason' => $daysRemaining <= 7
                    ? sprintf('Today\'s slice (%d of %d working days left)', 1, $daysRemaining)
                    : 'Today\'s KPI progress target',
                'entity_id' => $kpiId,
                'entity_type' => 'kpi',
                'due_at' => $today->copy()->endOfDay()->toIso8601String(),
                'distance_km' => null,
                'suggested_action' => trim((string) $kpi->objective) !== ''
                    ? (string) $kpi->objective
                    : 'Complete this KPI slice before end of day',
                'score' => $baseScore + ($chunkCount - $index) * 0.1,
                'kpi_name' => (string) $kpi->name,
                'kpi_category' => $kpi->category?->value,
                'kpi_objective' => (string) ($kpi->objective ?? ''),
                'kpi_priority' => $kpi->priority?->value ?? 'medium',
                'kpi_end_date' => $kpi->end_date?->toDateString(),
                'kpi_chunk_amount' => $chunkAmount,
                'kpi_chunk_index' => $chunkNumber,
                'kpi_chunk_total' => $chunkCount,
                'kpi_dedupe_key' => $dedupeKey,
                'parent_item_id' => $parentItemId,
                'parent_entity_type' => 'kpi',
                'parent_entity_id' => $kpiId,
            ];
        }

        return $candidates;
    }

    public function taskTypeForCategory(?string $category): string
    {
        return match ($category) {
            KpiCategory::COLLECTION->value => TaskType::COLLECTION->value,
            KpiCategory::SURVEY->value, KpiCategory::MERCHANDISING->value => TaskType::AWARENESS->value,
            KpiCategory::LEAD_GENERATION->value => TaskType::SALES_VISIT->value,
            default => TaskType::SALES_VISIT->value,
        };
    }

    public function taskPriorityForKpi(?string $priority): string
    {
        return match ($priority) {
            KpiPriority::CRITICAL->value, KpiPriority::HIGH->value => 'high',
            KpiPriority::LOW->value => 'low',
            default => 'medium',
        };
    }

    private function parseNumericTarget(string $targetValue): ?int
    {
        $trimmed = trim($targetValue);
        if ($trimmed === '') {
            return null;
        }

        if (preg_match('/(\d+(?:\.\d+)?)/', $trimmed, $matches) !== 1) {
            return null;
        }

        return max(1, (int) round((float) $matches[1]));
    }

    private function parseUnitLabel(string $targetValue, ?string $category): string
    {
        $lower = strtolower($targetValue);

        if (str_contains($lower, 'visit')) {
            return 'visits';
        }
        if (str_contains($lower, 'lead')) {
            return 'leads';
        }
        if (str_contains($lower, 'sale')) {
            return 'sales';
        }
        if (str_contains($lower, '%') || str_contains($lower, 'percent')) {
            return 'units';
        }

        return match ($category) {
            KpiCategory::CUSTOMER_VISITS->value => 'visits',
            KpiCategory::LEAD_GENERATION->value => 'leads',
            KpiCategory::SALES->value => 'sales',
            default => 'units',
        };
    }

    /**
     * @return array<int, int>
     */
    private function splitIntoChunks(int $dailyQuota, int $maxChunks): array
    {
        if ($dailyQuota <= 3) {
            return [$dailyQuota];
        }

        $chunkCount = match (true) {
            $dailyQuota >= 9 => $maxChunks,
            $dailyQuota >= 4 => 2,
            default => 1,
        };
        $base = intdiv($dailyQuota, $chunkCount);
        $remainder = $dailyQuota % $chunkCount;

        $chunks = [];
        for ($i = 0; $i < $chunkCount; $i++) {
            $chunks[] = $base + ($i < $remainder ? 1 : 0);
        }

        return $chunks;
    }

    /**
     * @param  array<int, string>|null  $workingDays
     */
    private function countWorkingDaysRemaining(Carbon $from, Carbon $to, ?array $workingDays): int
    {
        if ($workingDays === null || $workingDays === []) {
            return max(1, (int) $from->diffInDays($to) + 1);
        }

        $normalized = array_map(static fn (string $day): string => strtolower(trim($day)), $workingDays);
        $count = 0;
        $cursor = $from->copy();

        while ($cursor->lte($to)) {
            if (in_array(strtolower($cursor->englishDayOfWeek), $normalized, true)) {
                $count++;
            }
            $cursor->addDay();
        }

        return max(1, $count);
    }
}
