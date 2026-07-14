import { describe, expect, it } from "vitest";

import { resolveLivePolylineForHydrate } from "@/lib/tracking/live-polyline";

describe("live-polyline", () => {
  it("resets stale session breadcrumbs on hydrate", () => {
    const staleTrail: [number, number][] = [
      [3.1891693, 6.5947258],
      [3.35, 6.54],
    ];
    const anchor: [number, number] = [3.366577, 6.531942];

    expect(resolveLivePolylineForHydrate(staleTrail, anchor)).toEqual([anchor]);
  });

  it("keeps in-progress trail when origin is near the anchor", () => {
    const liveTrail: [number, number][] = [
      [3.3665, 6.5319],
      [3.3666, 6.532],
    ];
    const anchor: [number, number] = [3.366577, 6.531942];

    expect(resolveLivePolylineForHydrate(liveTrail, anchor)).toEqual(liveTrail);
  });
});
