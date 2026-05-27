import { describe, expect, it } from "vitest";

import {
    getCountryFallbackViewport,
    toPrivacySafeRegionalCenter,
} from "@/lib/map/default-viewport";

describe("default-viewport", () => {
    it("builds a country-level viewport when an explicit country code is provided", () => {
        const viewport = getCountryFallbackViewport("GB");

        expect(viewport.granularity).toBe("country");
        expect(viewport.countryCode).toBe("GB");
        expect(viewport.center).toEqual([-3.4, 55.4]);
    });

    it("falls back to global view when country is unknown", () => {
        const viewport = getCountryFallbackViewport("ZZ");

        expect(viewport.granularity).toBe("global");
        expect(viewport.countryCode).toBeNull();
        expect(viewport.center).toEqual([0, 20]);
    });

    it("returns an obfuscated regional center instead of exact user coordinates", () => {
        const center = toPrivacySafeRegionalCenter(51.5074, -0.1278);

        expect(center[0]).not.toBe(-0.1278);
        expect(center[1]).not.toBe(51.5074);
        expect(center[0]).toBeGreaterThanOrEqual(-180);
        expect(center[0]).toBeLessThanOrEqual(180);
        expect(center[1]).toBeGreaterThanOrEqual(-85);
        expect(center[1]).toBeLessThanOrEqual(85);
    });
});
