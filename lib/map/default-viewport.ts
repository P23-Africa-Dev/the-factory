export type ViewportGranularity = "proximity" | "country" | "global";

export type ResolvedMapViewport = {
    center: [number, number];
    zoom: number;
    granularity: ViewportGranularity;
    countryCode: string | null;
};

const GLOBAL_VIEWPORT: ResolvedMapViewport = {
    center: [0, 20],
    zoom: 1.9,
    granularity: "global",
    countryCode: null,
};

const PROXIMITY_ZOOM = 8.8;

const COUNTRY_VIEWPORTS: Record<string, { center: [number, number]; zoom: number }> = {
    NG: { center: [8.6753, 9.082], zoom: 5.2 },
    GB: { center: [-3.4, 55.4], zoom: 5.2 },
    US: { center: [-98.58, 39.82], zoom: 3.6 },
    CA: { center: [-106.35, 56.13], zoom: 3.1 },
    IN: { center: [78.9629, 20.5937], zoom: 4.4 },
    AU: { center: [133.7751, -25.2744], zoom: 3.5 },
    ZA: { center: [22.9375, -30.5595], zoom: 4.7 },
    KE: { center: [37.9062, -0.0236], zoom: 5.6 },
    GH: { center: [-1.0232, 7.9465], zoom: 6.0 },
    FR: { center: [2.2137, 46.2276], zoom: 5.1 },
    DE: { center: [10.4515, 51.1657], zoom: 5.0 },
};

const TIMEZONE_TO_COUNTRY: Array<{ prefix: string; country: string }> = [
    { prefix: "Africa/Lagos", country: "NG" },
    { prefix: "Europe/London", country: "GB" },
    { prefix: "America/New_York", country: "US" },
    { prefix: "America/Chicago", country: "US" },
    { prefix: "America/Denver", country: "US" },
    { prefix: "America/Los_Angeles", country: "US" },
    { prefix: "Asia/Kolkata", country: "IN" },
    { prefix: "Africa/Nairobi", country: "KE" },
    { prefix: "Africa/Accra", country: "GH" },
    { prefix: "Africa/Johannesburg", country: "ZA" },
    { prefix: "Europe/Paris", country: "FR" },
    { prefix: "Europe/Berlin", country: "DE" },
    { prefix: "Australia/", country: "AU" },
    { prefix: "Canada/", country: "CA" },
];

let cachedViewport: ResolvedMapViewport | null = null;
let inFlightViewportPromise: Promise<ResolvedMapViewport> | null = null;

function normalizeCountryCode(input: string | null | undefined): string | null {
    if (!input) return null;
    const code = input.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? code : null;
}

function extractCountryFromLocale(locale: string | null | undefined): string | null {
    if (!locale) return null;

    const text = locale.trim();
    if (!text) return null;

    if (typeof Intl !== "undefined" && "Locale" in Intl) {
        try {
            const region = new Intl.Locale(text).region;
            return normalizeCountryCode(region);
        } catch {
            // Fallback to regex parsing below.
        }
    }

    const match = text.match(/[-_]([A-Za-z]{2})\b/);
    return normalizeCountryCode(match?.[1] ?? null);
}

function inferCountryCodeFromTimezone(timeZone: string | null | undefined): string | null {
    if (!timeZone) return null;

    for (const entry of TIMEZONE_TO_COUNTRY) {
        if (timeZone.startsWith(entry.prefix)) {
            return entry.country;
        }
    }

    return null;
}

function detectCountryCodeFromBrowser(): string | null {
    if (typeof navigator === "undefined") {
        return null;
    }

    const fromLanguages = [
        ...(navigator.languages ?? []),
        navigator.language,
    ]
        .map((locale) => extractCountryFromLocale(locale))
        .find((code): code is string => code !== null);

    if (fromLanguages) {
        return fromLanguages;
    }

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return inferCountryCodeFromTimezone(timeZone);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function getDeterministicNoise(a: number, b: number): number {
    const sine = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
    return sine - Math.floor(sine);
}

export function toPrivacySafeRegionalCenter(latitude: number, longitude: number): [number, number] {
    const quantizedLat = Math.round(latitude * 4) / 4;
    const quantizedLng = Math.round(longitude * 4) / 4;

    const noiseA = getDeterministicNoise(latitude, longitude) - 0.5;
    const noiseB = getDeterministicNoise(longitude, latitude) - 0.5;

    const latWithOffset = clamp(quantizedLat + noiseA * 0.36, -85, 85);
    const lngWithOffset = clamp(quantizedLng + noiseB * 0.36, -180, 180);

    return [Number(lngWithOffset.toFixed(4)), Number(latWithOffset.toFixed(4))];
}

export function getCountryFallbackViewport(countryCode?: string | null): ResolvedMapViewport {
    const resolvedCountryCode = normalizeCountryCode(countryCode) ?? detectCountryCodeFromBrowser();

    if (resolvedCountryCode && COUNTRY_VIEWPORTS[resolvedCountryCode]) {
        const selected = COUNTRY_VIEWPORTS[resolvedCountryCode];
        return {
            center: selected.center,
            zoom: selected.zoom,
            granularity: "country",
            countryCode: resolvedCountryCode,
        };
    }

    return { ...GLOBAL_VIEWPORT };
}

function requestApproximateBrowserPosition(): Promise<{ latitude: number; longitude: number }> {
    return new Promise((resolve, reject) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
            reject(new Error("Geolocation unavailable"));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
            },
            (error) => reject(error),
            {
                enableHighAccuracy: false,
                timeout: 5000,
                maximumAge: 5 * 60_000,
            }
        );
    });
}

export async function resolvePrivacySafeViewport(): Promise<ResolvedMapViewport> {
    if (cachedViewport) {
        return cachedViewport;
    }

    if (inFlightViewportPromise) {
        return inFlightViewportPromise;
    }

    inFlightViewportPromise = (async () => {
        const detectedCountryCode = detectCountryCodeFromBrowser();

        try {
            const { latitude, longitude } = await requestApproximateBrowserPosition();
            const center = toPrivacySafeRegionalCenter(latitude, longitude);

            cachedViewport = {
                center,
                zoom: PROXIMITY_ZOOM,
                granularity: "proximity",
                countryCode: detectedCountryCode,
            };

            return cachedViewport;
        } catch {
            cachedViewport = getCountryFallbackViewport(detectedCountryCode);
            return cachedViewport;
        } finally {
            inFlightViewportPromise = null;
        }
    })();

    return inFlightViewportPromise;
}

export function resetViewportResolverCacheForTests(): void {
    cachedViewport = null;
    inFlightViewportPromise = null;
}
