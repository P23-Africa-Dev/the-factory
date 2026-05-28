"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { MapAdapter, MapInitOptions, MapProvider } from "@/lib/map/types";
import { useMapProvider } from "@/lib/map/use-map-provider";
import { MapboxAdapter } from "@/lib/map/adapters/mapbox-adapter";
import { GoogleAdapter } from "@/lib/map/adapters/google-adapter";

type MapRendererProps = {
    provider?: MapProvider;
    className?: string;
    style?: CSSProperties;
    initOptions: MapInitOptions;
    onReady?: (adapter: MapAdapter) => void;
    onError?: (error: unknown) => void;
};

function buildAdapter(provider: MapProvider): MapAdapter {
    if (provider === "google") {
        return new GoogleAdapter();
    }

    return new MapboxAdapter();
}

export function MapRenderer({
    provider,
    className,
    style,
    initOptions,
    onReady,
    onError,
}: MapRendererProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const adapterRef = useRef<MapAdapter | null>(null);
    const [isReady, setIsReady] = useState(false);

    const providerState = useMapProvider();
    const effectiveProvider = provider ?? providerState.provider;

    const stableOptions = useMemo(
        () => ({ ...initOptions }),
        [initOptions]
    );

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        setIsReady(false);

        const adapter = buildAdapter(effectiveProvider);
        adapterRef.current = adapter;

        let disposed = false;

        adapter
            .init(container, stableOptions)
            .then(() => {
                if (disposed) {
                    return;
                }

                setIsReady(true);
                onReady?.(adapter);
            })
            .catch((error) => {
                if (disposed) {
                    return;
                }

                onError?.(error);
            });

        return () => {
            disposed = true;
            setIsReady(false);
            adapter.destroy();
            adapterRef.current = null;
        };
    }, [effectiveProvider, onError, onReady, stableOptions]);

    return (
        <div className={className} style={style} data-map-provider={effectiveProvider} data-map-ready={isReady}>
            <div ref={containerRef} className="h-full w-full" />
        </div>
    );
}
