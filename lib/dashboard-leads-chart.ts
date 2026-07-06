import type { LeadsTrendPoint } from "@/lib/api/dashboard";

export const LEADS_TREND_BAR_COLORS = {
  rise: "#7BB6B8",
  fall: "#FD6046",
} as const;

export const LEADS_TREND_BUCKET_COUNT = 6;

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

export function buildCalibratedLeadsTrendChart(
  points: LeadsTrendPoint[] | undefined | null,
): LeadsTrendPoint[] {
  return normalizeLeadsTrendBuckets(points);
}
