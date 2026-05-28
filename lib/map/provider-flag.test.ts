import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    clearStoredMapProvider,
    getEnvMapProvider,
    getStoredMapProvider,
    MAP_PROVIDER_ENV_KEY,
    MAP_PROVIDER_STORAGE_KEY,
    normalizeMapProvider,
    resolveMapProvider,
    setStoredMapProvider,
} from "@/lib/map/provider-flag";

describe("provider-flag", () => {
    const originalEnv = process.env.NEXT_PUBLIC_MAP_PROVIDER;

    beforeEach(() => {
        window.localStorage.clear();
        delete process.env.NEXT_PUBLIC_MAP_PROVIDER;
    });

    afterEach(() => {
        window.localStorage.clear();

        if (typeof originalEnv === "string") {
            process.env.NEXT_PUBLIC_MAP_PROVIDER = originalEnv;
        } else {
            delete process.env.NEXT_PUBLIC_MAP_PROVIDER;
        }
    });

    it("normalizes valid provider values", () => {
        expect(normalizeMapProvider("mapbox")).toBe("mapbox");
        expect(normalizeMapProvider("  GOOGLE ")).toBe("google");
    });

    it("rejects unknown providers", () => {
        expect(normalizeMapProvider("leaflet")).toBeNull();
        expect(normalizeMapProvider(123)).toBeNull();
        expect(normalizeMapProvider(null)).toBeNull();
    });

    it("uses env provider when configured", () => {
        process.env.NEXT_PUBLIC_MAP_PROVIDER = "google";

        expect(getEnvMapProvider()).toBe("google");
    });

    it("defaults env provider to mapbox when missing or invalid", () => {
        delete process.env.NEXT_PUBLIC_MAP_PROVIDER;
        expect(getEnvMapProvider()).toBe("mapbox");

        process.env.NEXT_PUBLIC_MAP_PROVIDER = "unknown";
        expect(getEnvMapProvider()).toBe("mapbox");
    });

    it("stores and resolves client-side provider overrides", () => {
        process.env.NEXT_PUBLIC_MAP_PROVIDER = "mapbox";

        expect(getStoredMapProvider()).toBeNull();
        expect(resolveMapProvider()).toBe("mapbox");

        setStoredMapProvider("google");
        expect(window.localStorage.getItem(MAP_PROVIDER_STORAGE_KEY)).toBe("google");
        expect(getStoredMapProvider()).toBe("google");
        expect(resolveMapProvider()).toBe("google");

        clearStoredMapProvider();
        expect(window.localStorage.getItem(MAP_PROVIDER_STORAGE_KEY)).toBeNull();
        expect(resolveMapProvider()).toBe("mapbox");
    });

    it("keeps env key constant for external config", () => {
        expect(MAP_PROVIDER_ENV_KEY).toBe("NEXT_PUBLIC_MAP_PROVIDER");
    });
});
