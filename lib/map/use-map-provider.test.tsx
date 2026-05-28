import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { MAP_PROVIDER_STORAGE_KEY } from "@/lib/map/provider-flag";
import { useMapProvider } from "@/lib/map/use-map-provider";

describe("useMapProvider", () => {
    beforeEach(() => {
        window.localStorage.clear();
        delete process.env.NEXT_PUBLIC_MAP_PROVIDER;
    });

    it("hydrates from env default when storage is empty", async () => {
        process.env.NEXT_PUBLIC_MAP_PROVIDER = "mapbox";

        const { result } = renderHook(() => useMapProvider());

        await waitFor(() => {
            expect(result.current.isHydrated).toBe(true);
        });

        expect(result.current.provider).toBe("mapbox");
    });

    it("prefers localStorage provider over env", async () => {
        process.env.NEXT_PUBLIC_MAP_PROVIDER = "mapbox";
        window.localStorage.setItem(MAP_PROVIDER_STORAGE_KEY, "google");

        const { result } = renderHook(() => useMapProvider());

        await waitFor(() => {
            expect(result.current.isHydrated).toBe(true);
        });

        expect(result.current.provider).toBe("google");
    });

    it("persists provider changes", async () => {
        const { result } = renderHook(() => useMapProvider());

        await waitFor(() => {
            expect(result.current.isHydrated).toBe(true);
        });

        act(() => {
            result.current.setProvider("google");
        });

        expect(result.current.provider).toBe("google");
        expect(window.localStorage.getItem(MAP_PROVIDER_STORAGE_KEY)).toBe("google");
    });

    it("synchronizes provider changes across multiple hook instances", async () => {
        const first = renderHook(() => useMapProvider());
        const second = renderHook(() => useMapProvider());

        await waitFor(() => {
            expect(first.result.current.isHydrated).toBe(true);
            expect(second.result.current.isHydrated).toBe(true);
        });

        act(() => {
            first.result.current.setProvider("google");
        });

        await waitFor(() => {
            expect(second.result.current.provider).toBe("google");
        });
    });
});
