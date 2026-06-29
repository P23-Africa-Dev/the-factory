import { describe, expect, it } from "vitest";

import {
  buildCalibratedLeadsTrendChart,
  LEADS_TREND_BUCKET_COUNT,
  LEADS_TREND_MIN_BAR_VALUE,
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

  it("floors all-zero data to minimum bar values for both colors", () => {
    expect(buildCalibratedLeadsTrendChart([])).toEqual(
      Array.from({ length: LEADS_TREND_BUCKET_COUNT }, (_, index) => ({
        name: String(index + 1),
        v1: LEADS_TREND_MIN_BAR_VALUE,
        v2: LEADS_TREND_MIN_BAR_VALUE,
      })),
    );
  });

  it("floors only the zero side when one metric is missing", () => {
    expect(
      buildCalibratedLeadsTrendChart([{ name: "1", v1: 10, v2: 0 }]),
    ).toEqual([
      { name: "1", v1: 10, v2: LEADS_TREND_MIN_BAR_VALUE },
      { name: "2", v1: LEADS_TREND_MIN_BAR_VALUE, v2: LEADS_TREND_MIN_BAR_VALUE },
      { name: "3", v1: LEADS_TREND_MIN_BAR_VALUE, v2: LEADS_TREND_MIN_BAR_VALUE },
      { name: "4", v1: LEADS_TREND_MIN_BAR_VALUE, v2: LEADS_TREND_MIN_BAR_VALUE },
      { name: "5", v1: LEADS_TREND_MIN_BAR_VALUE, v2: LEADS_TREND_MIN_BAR_VALUE },
      { name: "6", v1: LEADS_TREND_MIN_BAR_VALUE, v2: LEADS_TREND_MIN_BAR_VALUE },
    ]);

    expect(
      buildCalibratedLeadsTrendChart([{ name: "1", v1: 0, v2: 7 }]),
    ).toEqual([
      { name: "1", v1: LEADS_TREND_MIN_BAR_VALUE, v2: 7 },
      { name: "2", v1: LEADS_TREND_MIN_BAR_VALUE, v2: LEADS_TREND_MIN_BAR_VALUE },
      { name: "3", v1: LEADS_TREND_MIN_BAR_VALUE, v2: LEADS_TREND_MIN_BAR_VALUE },
      { name: "4", v1: LEADS_TREND_MIN_BAR_VALUE, v2: LEADS_TREND_MIN_BAR_VALUE },
      { name: "5", v1: LEADS_TREND_MIN_BAR_VALUE, v2: LEADS_TREND_MIN_BAR_VALUE },
      { name: "6", v1: LEADS_TREND_MIN_BAR_VALUE, v2: LEADS_TREND_MIN_BAR_VALUE },
    ]);
  });

  it("preserves values above the minimum floor", () => {
    expect(
      buildCalibratedLeadsTrendChart([
        { name: "1", v1: 12, v2: 5 },
        { name: "2", v1: 3, v2: 8 },
      ]),
    ).toEqual([
      { name: "1", v1: 12, v2: 5 },
      { name: "2", v1: 3, v2: 8 },
      { name: "3", v1: LEADS_TREND_MIN_BAR_VALUE, v2: LEADS_TREND_MIN_BAR_VALUE },
      { name: "4", v1: LEADS_TREND_MIN_BAR_VALUE, v2: LEADS_TREND_MIN_BAR_VALUE },
      { name: "5", v1: LEADS_TREND_MIN_BAR_VALUE, v2: LEADS_TREND_MIN_BAR_VALUE },
      { name: "6", v1: LEADS_TREND_MIN_BAR_VALUE, v2: LEADS_TREND_MIN_BAR_VALUE },
    ]);
  });
});
