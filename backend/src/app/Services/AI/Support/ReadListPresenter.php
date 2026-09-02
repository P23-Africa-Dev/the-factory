<?php

declare(strict_types=1);

namespace App\Services\AI\Support;

final class ReadListPresenter
{
    public function previewLimit(): int
    {
        return max(1, (int) config('ely.read_list.preview_limit', 10));
    }

    public function maxExpandedLimit(?string $tool = null): int
    {
        if ($tool === 'org.users') {
            return max(1, (int) config('ely.read_list.max_expanded_limit_org_users', 100));
        }

        return max(1, (int) config('ely.read_list.max_expanded_limit', 50));
    }

    /**
     * @param  array<int, mixed>  $items
     * @return array<string, mixed>
     */
    public function enrichPayload(
        array $items,
        int $total,
        ?int $matchedTotal = null,
        ?int $organizationTotal = null,
    ): array {
        $count = count($items);
        $scopeTotal = $matchedTotal ?? $total;
        $truncated = $scopeTotal > $count;
        $remainingCount = max(0, $scopeTotal - $count);

        $payload = [
            'items' => $items,
            'count' => $count,
            'total' => $organizationTotal ?? $total,
            'truncated' => $truncated,
            'remaining_count' => $remainingCount,
            'preview_limit' => $this->previewLimit(),
            'offer_full_list' => $truncated,
        ];

        if ($matchedTotal !== null) {
            $payload['matched_total'] = $matchedTotal;
        }

        return $payload;
    }

    public function formatListHeader(
        string $resourceLabel,
        int $shownCount,
        int $scopeTotal,
        ?string $filterLabel = null,
        bool $truncated = false,
        int $remainingCount = 0,
        ?int $organizationTotal = null,
    ): string {
        if ($scopeTotal <= 0) {
            if ($filterLabel !== null && $filterLabel !== '') {
                return sprintf('No %s found matching "%s" in your active organization scope.', $resourceLabel, $filterLabel);
            }

            return sprintf('No %s were found in your active organization scope.', $resourceLabel);
        }

        $header = $filterLabel !== null && $filterLabel !== ''
            ? sprintf('Found %d %s matching "%s"', $scopeTotal, $resourceLabel, $filterLabel)
            : sprintf('Found %d %s', $scopeTotal, $resourceLabel);

        if ($organizationTotal !== null && $organizationTotal !== $scopeTotal && $filterLabel !== null) {
            $header .= sprintf(' (%d total in your CRM)', $organizationTotal);
        }

        if ($truncated && $remainingCount > 0) {
            $header .= sprintf('. Showing %d (%d more)', $shownCount, $remainingCount);
        } elseif ($shownCount < $scopeTotal) {
            $header .= sprintf('. Showing %d', $shownCount);
        }

        return $header . ':';
    }
}
