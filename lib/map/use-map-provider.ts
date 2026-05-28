"use client";

import { useCallback, useEffect, useState } from "react";
import type { MapProvider } from "@/lib/map/types";
import {
    MAP_PROVIDER_CHANGE_EVENT,
    MAP_PROVIDER_STORAGE_KEY,
    resolveMapProvider,
    setStoredMapProvider,
} from "@/lib/map/provider-flag";

export type UseMapProviderResult = {
    provider: MapProvider;
    isHydrated: boolean;
    setProvider: (next: MapProvider) => void;
};

export function useMapProvider(): UseMapProviderResult {
    const [provider, setProviderState] = useState<MapProvider>(() => resolveMapProvider());
    const isHydrated = typeof window !== "undefined";

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const syncProvider = () => {
            setProviderState(resolveMapProvider());
        };

        const onStorage = (event: StorageEvent) => {
            if (event.key !== null && event.key !== MAP_PROVIDER_STORAGE_KEY) {
                return;
            }

            syncProvider();
        };

        const onProviderChange = () => {
            syncProvider();
        };

        window.addEventListener("storage", onStorage);
        window.addEventListener(MAP_PROVIDER_CHANGE_EVENT, onProviderChange as EventListener);

        return () => {
            window.removeEventListener("storage", onStorage);
            window.removeEventListener(MAP_PROVIDER_CHANGE_EVENT, onProviderChange as EventListener);
        };
    }, []);

    const setProvider = useCallback((next: MapProvider) => {
        setProviderState(next);
        setStoredMapProvider(next);
    }, []);

    return {
        provider,
        isHydrated,
        setProvider,
    };
}
