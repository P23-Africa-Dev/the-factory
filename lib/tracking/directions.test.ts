import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    clearDirectionsCache,
    fetchDirectionsRouteGoogle,
} from "@/lib/tracking/directions";

describe("directions", () => {
    beforeEach(() => {
        clearDirectionsCache();
        vi.restoreAllMocks();
    });

    it("decodes google route polyline and reuses cached result", async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({
                routes: [
                    {
                        polyline: {
                            // Encodes: [-120.2,38.5], [-120.95,40.7], [-126.453,43.252]
                            encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
                        },
                    },
                ],
            }),
        }));

        vi.stubGlobal("fetch", fetchMock);

        const origin: [number, number] = [-120.2, 38.5];
        const destination: [number, number] = [-126.453, 43.252];

        const first = await fetchDirectionsRouteGoogle(origin, destination, "test-key");
        const second = await fetchDirectionsRouteGoogle(origin, destination, "test-key");

        expect(first).toEqual([
            [-120.2, 38.5],
            [-120.95, 40.7],
            [-126.453, 43.252],
        ]);
        expect(second).toEqual(first);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("returns null when google routes responds with non-2xx", async () => {
        const fetchMock = vi.fn(async () => ({ ok: false, status: 403 }));
        vi.stubGlobal("fetch", fetchMock);

        const route = await fetchDirectionsRouteGoogle([0, 1], [2, 3], "bad-key");

        expect(route).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
