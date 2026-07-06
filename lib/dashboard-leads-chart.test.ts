import { describe, expect, it } from "vitest";

import {
  buildCalibratedLeadsTrendChart,
  hasLeadsTrendData,
  LEADS_TREND_BUCKET_COUNT,
  normalizeLeadsTrendBuckets,
} from "@/lib/dashboard-leads-chart";

describe("dashboard-leads-chart", () => {
  it("normalizes empty input to six zero buckets", () => {
    expect(normalizeLeadsTrendBuckets([])).toEqual(
      Array.from({ length: LEADS_TREND_BUCKET_COUNT }, (_, index) => ({
        name: String(index + 1),
        v1: 0,
        v2: 0,
      })),
    );
  });

  it("pads short API arrays to six buckets", () => {
    expect(
      normalizeLeadsTrendBuckets([
        { name: "1", v1: 4, v2: 2 },
        { name: "2", v1: 1, v2: 0 },
        { name: "3", v1: 0, v2: 3 },
      ]),
    ).toEqual([
      { name: "1", v1: 4, v2: 2 },
      { name: "2", v1: 1, v2: 0 },
      { name: "3", v1: 0, v2: 3 },
      { name: "4", v1: 0, v2: 0 },
      { name: "5", v1: 0, v2: 0 },
      { name: "6", v1: 0, v2: 0 },
    ]);
  });

  it("preserves actual counts without a minimum bar floor", () => {
    expect(buildCalibratedLeadsTrendChart([])).toEqual(
      Array.from({ length: LEADS_TREND_BUCKET_COUNT }, (_, index) => ({
        name: String(index + 1),
        v1: 0,
        v2: 0,
      })),
    );
  });

  it("keeps zero values when only one metric is present", () => {
    expect(
      buildCalibratedLeadsTrendChart([{ name: "1", v1: 10, v2: 0 }]),
    ).toEqual([
      { name: "1", v1: 10, v2: 0 },
      { name: "2", v1: 0, v2: 0 },
      { name: "3", v1: 0, v2: 0 },
      { name: "4", v1: 0, v2: 0 },
      { name: "5", v1: 0, v2: 0 },
      { name: "6", v1: 0, v2: 0 },
    ]);

    expect(
      buildCalibratedLeadsTrendChart([{ name: "1", v1: 0, v2: 7 }]),
    ).toEqual([
      { name: "1", v1: 0, v2: 7 },
      { name: "2", v1: 0, v2: 0 },
      { name: "3", v1: 0, v2: 0 },
      { name: "4", v1: 0, v2: 0 },
      { name: "5", v1: 0, v2: 0 },
      { name: "6", v1: 0, v2: 0 },
    ]);
  });

  it("preserves non-zero values across sparse buckets", () => {
    expect(
      buildCalibratedLeadsTrendChart([
        { name: "1", v1: 12, v2: 5 },
        { name: "2", v1: 3, v2: 8 },
      ]),
    ).toEqual([
      { name: "1", v1: 12, v2: 5 },
      { name: "2", v1: 3, v2: 8 },
      { name: "3", v1: 0, v2: 0 },
      { name: "4", v1: 0, v2: 0 },
      { name: "5", v1: 0, v2: 0 },
      { name: "6", v1: 0, v2: 0 },
    ]);
  });

  it("detects when trend data is empty or present", () => {
    expect(hasLeadsTrendData([])).toBe(false);
    expect(hasLeadsTrendData([{ name: "1", v1: 0, v2: 0 }])).toBe(false);
    expect(hasLeadsTrendData([{ name: "1", v1: 2, v2: 0 }])).toBe(true);
    expect(hasLeadsTrendData([{ name: "1", v1: 0, v2: 1 }])).toBe(true);
  });
});
