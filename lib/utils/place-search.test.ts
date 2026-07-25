import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/public-env", () => ({
  getMapboxPublicToken: () => "test-mapbox-token",
}));

vi.mock("@/store/map-credits", () => ({
  ingestCreditMeta: vi.fn(),
}));

import {
  __resetPlaceSearchCachesForTests,
  suggestPlaces,
} from "@/lib/utils/place-search";

const SEARCHBOX = "https://api.mapbox.com/search/searchbox/v1/suggest";

function mapboxSuggestPayload(
  suggestions: Array<{
    mapbox_id: string;
    name: string;
    place_formatted?: string;
    feature_type?: string;
  }>,
) {
  return {
    suggestions: suggestions.map((s) => ({
      mapbox_id: s.mapbox_id,
      name: s.name,
      place_formatted: s.place_formatted ?? "Somewhere",
      feature_type: s.feature_type ?? "poi",
    })),
  };
}

describe("suggestPlaces Mapbox-first waterfall", () => {
  beforeEach(() => {
    __resetPlaceSearchCachesForTests();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns Mapbox results and does not call Google when quality passes", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          mapboxSuggestPayload([
            {
              mapbox_id: "mb.1",
              name: "Cafe Nero",
              place_formatted: "Oxford Street, London",
              feature_type: "poi",
            },
          ]),
        ),
        { status: 200 },
      ),
    );

    const results = await suggestPlaces("cafe", {
      sessionToken: "sess-1",
      limit: 6,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.provider).toBe("mapbox");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(SEARCHBOX);
  });

  it("falls back to Google once when Mapbox quality fails", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ suggestions: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            enabled: true,
            suggestions: [
              {
                placeId: "ChIJabc",
                name: "Google Cafe",
                placeFormatted: "London",
                category: "cafe",
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const results = await suggestPlaces("xyzzy-unknown-place", {
      sessionToken: "sess-2",
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.provider).toBe("google");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("/api/places/autocomplete");
  });

  it("serves cache hit without a second upstream call", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify(
          mapboxSuggestPayload([
            {
              mapbox_id: "mb.2",
              name: "Bank",
              placeFormatted: "Canary Wharf",
            },
          ]),
        ),
        { status: 200 },
      ),
    );

    const a = await suggestPlaces("bank", { sessionToken: "a" });
    const b = await suggestPlaces("bank", { sessionToken: "b" });

    expect(a[0]?.id).toBe("mb.2");
    expect(b[0]?.sessionToken).toBe("b");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("dedupes identical in-flight suggest requests", async () => {
    const fetchMock = vi.mocked(fetch);
    let resolveFetch!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const p1 = suggestPlaces("hotel", { sessionToken: "s1" });
    const p2 = suggestPlaces("hotel", { sessionToken: "s2" });

    resolveFetch(
      new Response(
        JSON.stringify(
          mapboxSuggestPayload([
            {
              mapbox_id: "mb.3",
              name: "Hotel",
              placeFormatted: "Westminster",
            },
          ]),
        ),
        { status: 200 },
      ),
    );

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1[0]?.id).toBe("mb.3");
    expect(r2[0]?.id).toBe("mb.3");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips Google when skipGoogle is set even if Mapbox is empty", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ suggestions: [] }), { status: 200 }),
    );

    const results = await suggestPlaces("nothing", {
      sessionToken: "s",
      skipGoogle: true,
    });

    expect(results).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(SEARCHBOX);
  });
});
