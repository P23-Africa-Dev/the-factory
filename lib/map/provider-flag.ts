import type { MapProvider } from "@/lib/map/types";

export const MAP_PROVIDER_ENV_KEY = "NEXT_PUBLIC_MAP_PROVIDER";
export const MAP_PROVIDER_STORAGE_KEY = "factory23.map.provider";
export const MAP_PROVIDER_CHANGE_EVENT = "factory23:map-provider-change";

const SUPPORTED_MAP_PROVIDERS: MapProvider[] = ["mapbox", "google"];

function dispatchMapProviderChange(provider: MapProvider | null): void {
    if (typeof window === "undefined") {
        return;
    }

    window.dispatchEvent(new CustomEvent<MapProvider | null>(MAP_PROVIDER_CHANGE_EVENT, {
        detail: provider,
    }));
}

export function normalizeMapProvider(value: unknown): MapProvider | null {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim().toLowerCase();
    if ((SUPPORTED_MAP_PROVIDERS as string[]).includes(normalized)) {
        return normalized as MapProvider;
    }

    return null;
}

export function getEnvMapProvider(): MapProvider {
    const fromEnv = normalizeMapProvider(process.env[MAP_PROVIDER_ENV_KEY]);
    return fromEnv ?? "mapbox";
}

export function getStoredMapProvider(): MapProvider | null {
    if (typeof window === "undefined") {
        return null;
    }

    try {
        return normalizeMapProvider(window.localStorage.getItem(MAP_PROVIDER_STORAGE_KEY));
    } catch {
        return null;
    }
}

export function setStoredMapProvider(provider: MapProvider): void {
    if (typeof window === "undefined") {
        return;
    }

    try {
        window.localStorage.setItem(MAP_PROVIDER_STORAGE_KEY, provider);
        dispatchMapProviderChange(provider);
    } catch {
        // Ignore storage errors in constrained/private contexts.
    }
}

export function clearStoredMapProvider(): void {
    if (typeof window === "undefined") {
        return;
    }

    try {
        window.localStorage.removeItem(MAP_PROVIDER_STORAGE_KEY);
        dispatchMapProviderChange(null);
    } catch {
        // Ignore storage errors in constrained/private contexts.
    }
}

export function resolveMapProvider(): MapProvider {
    if (typeof window === "undefined") {
        return getEnvMapProvider();
    }

    return getStoredMapProvider() ?? getEnvMapProvider();
}
