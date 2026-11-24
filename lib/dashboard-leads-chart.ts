import type { LeadsTrendPoint } from "@/lib/api/dashboard";

export const LEADS_TREND_BAR_COLORS = {
  rise: "#7BB6B8",
  fall: "#FD6046",
} as const;

export const LEADS_TREND_BUCKET_COUNT = 6;

/** Zero-count days render as zero (no fake bar), so the chart matches the real counts. */
export const LEADS_TREND_MIN_BAR_VALUE = 0;

export function normalizeLeadsTrendBuckets(
  points: LeadsTrendPoint[] | undefined | null,
): LeadsTrendPoint[] {
  const source = points ?? [];
  const normalized: LeadsTrendPoint[] = [];

  for (let index = 0; index < LEADS_TREND_BUCKET_COUNT; index++) {
    const point = source[index];
    normalized.push({
      name: point?.name ?? String(index + 1),
      v1: point?.v1 ?? 0,
      v2: point?.v2 ?? 0,
    });
  }

  return normalized;
}

export function hasLeadsTrendData(
  points: LeadsTrendPoint[] | undefined | null,
): boolean {
  return normalizeLeadsTrendBuckets(points).some(
    (point) => point.v1 > 0 || point.v2 > 0,
  );
}

/**
 * Normalize to six buckets (oldest day first, today last) with the real counts.
 */
export function buildCalibratedLeadsTrendChart(
  points: LeadsTrendPoint[] | undefined | null,
): LeadsTrendPoint[] {
  return normalizeLeadsTrendBuckets(points).map((point) => ({
    name: point.name,
    v1: Math.max(LEADS_TREND_MIN_BAR_VALUE, point.v1),
    v2: Math.max(LEADS_TREND_MIN_BAR_VALUE, point.v2),
  }));
}
