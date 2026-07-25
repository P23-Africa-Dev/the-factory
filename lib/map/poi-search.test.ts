import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/public-env", () => ({
  getMapboxPublicToken: () => "test-mapbox-token",
}));

vi.mock("@/store/map-credits", () => ({
  ingestCreditMeta: vi.fn(),
}));

vi.mock("@/lib/map/overpass-search", async () => {
  const actual = await vi.importActual<typeof import("@/lib/map/overpass-search")>(
    "@/lib/map/overpass-search",
  );
  return {
    ...actual,
    isBboxTooLarge: () => false,
    fetchBusinessesInBbox: vi.fn(async () => []),
    fetchBusinessesNearPoint: vi.fn(async () => []),
  };
});

import { fetchPlacesInArea } from "@/lib/map/poi-search";
import { __resetPlaceSearchCachesForTests } from "@/lib/utils/place-search";

describe("fetchPlacesInArea Mapbox-first", () => {
  beforeEach(() => {
    __resetPlaceSearchCachesForTests();
    vi.stubGlobal("fetch", vi.fn());
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not call Google Nearby when Mapbox returns enough POIs", async () => {
    const fetchMock = vi.mocked(fetch);

    // Each keyword: suggest then up to 2 retrieves. Provide rich Mapbox responses.
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/suggest")) {
        return new Response(
          JSON.stringify({
            suggestions: [
              {
                mapbox_id: `mb-${url.length}`,
                name: `Place ${url.length}`,
                place_formatted: "London",
                feature_type: "poi",
                poi_category: ["restaurant"],
              },
              {
                mapbox_id: `mb2-${url.length}`,
                name: `Place2 ${url.length}`,
                place_formatted: "London",
                feature_type: "poi",
                poi_category: ["restaurant"],
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/retrieve/")) {
        const id = url.match(/retrieve\/([^?]+)/)?.[1] ?? "x";
        return new Response(
          JSON.stringify({
            features: [
              {
                geometry: { coordinates: [-0.1, 51.5] },
                properties: { name: decodeURIComponent(id), place_formatted: "London" },
              },
            ],
          }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const results = await fetchPlacesInArea({
      name: "test",
      center: [-0.1, 51.5],
      radiusKm: 1,
    });

    expect(results.length).toBeGreaterThanOrEqual(3);
    const googleCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/api/places/nearby"),
    );
    expect(googleCalls).toHaveLength(0);
  });

  it("calls Google Nearby when Mapbox is empty and Google is allowed", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/suggest")) {
        return new Response(JSON.stringify({ suggestions: [] }), { status: 200 });
      }
      if (url.includes("/api/places/nearby")) {
        return new Response(
          JSON.stringify({
            enabled: true,
            places: [
              {
                id: "g1",
                lat: 51.5,
                lng: -0.1,
                name: "Google Place",
                category: "restaurant",
                categoryLabel: "Restaurant",
                categoryColor: "#000",
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 404 });
    });

    const results = await fetchPlacesInArea({
      name: "test",
      center: [-0.12, 51.51],
      radiusKm: 1,
    });

    expect(results.some((r) => r.name === "Google Place")).toBe(true);
    const googleCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/api/places/nearby"),
    );
    expect(googleCalls.length).toBeGreaterThanOrEqual(1);
  });
});
