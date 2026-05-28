import type {
    LngLat,
    MapAdapter,
    MapAdapterEvent,
    MapBounds,
    MapInitOptions,
    PolylineStyle,
} from "@/lib/map/types";
import {
    createMapboxTransformRequest,
    getMapboxPublicToken,
} from "@/lib/config/public-env";

type MapboxModule = typeof import("mapbox-gl");

type MapboxMap = {
    on: (event: string, handler: () => void) => void;
    flyTo: (opts: Record<string, unknown>) => void;
    easeTo: (opts: Record<string, unknown>) => void;
    fitBounds: (bounds: unknown, opts?: Record<string, unknown>) => void;
    addSource: (id: string, source: unknown) => void;
    addLayer: (layer: unknown) => void;
    getSource: (id: string) => { setData: (data: unknown) => void } | undefined;
    getLayer: (id: string) => unknown;
    removeLayer: (id: string) => void;
    removeSource: (id: string) => void;
    loaded: () => boolean;
    remove: () => void;
};

type MapboxMarker = {
    setLngLat: (lngLat: LngLat) => void;
    addTo: (map: MapboxMap) => void;
    remove: () => void;
};

type MapboxPopup = {
    setLngLat: (lngLat: LngLat) => MapboxPopup;
    setHTML: (html: string) => MapboxPopup;
    addTo: (map: MapboxMap) => MapboxPopup;
    remove: () => void;
};

function asGeoJsonLine(coords: LngLat[]) {
    return {
        type: "Feature",
        geometry: {
            type: "LineString",
            coordinates: coords,
        },
        properties: {},
    };
}

function sourceId(id: string) {
    return `polyline-source-${id}`;
}

function layerId(id: string) {
    return `polyline-layer-${id}`;
}

export class MapboxAdapter implements MapAdapter {
    private mapbox: MapboxModule | null = null;
    private map: MapboxMap | null = null;
    private ready = false;
    private markers = new Map<string, MapboxMarker>();
    private popups = new Map<string, MapboxPopup>();

    async init(container: HTMLElement, options: MapInitOptions): Promise<void> {
        const mapboxModule = await import("mapbox-gl");
        this.mapbox = mapboxModule;

        const accessToken = options.mapbox?.accessToken ?? getMapboxPublicToken();
        if (!accessToken) {
            throw new Error("Mapbox access token is missing.");
        }

        mapboxModule.accessToken = accessToken;

        const transformRequest = options.mapbox?.transformRequest ?? createMapboxTransformRequest();

        const map = new mapboxModule.Map({
            container,
            style: options.mapbox?.style ?? "mapbox://styles/mapbox/light-v11",
            center: options.center,
            zoom: options.zoom,
            minZoom: options.minZoom,
            maxZoom: options.maxZoom,
            interactive: options.interactive ?? true,
            transformRequest,
        }) as unknown as MapboxMap;

        this.map = map;

        await new Promise<void>((resolve) => {
            map.on("load", () => {
                this.ready = true;
                resolve();
            });
        });
    }

    destroy(): void {
        this.markers.forEach((marker) => marker.remove());
        this.markers.clear();

        this.popups.forEach((popup) => popup.remove());
        this.popups.clear();

        this.map?.remove();
        this.map = null;
        this.mapbox = null;
        this.ready = false;
    }

    setCenter(center: LngLat, zoom?: number, animated = true): void {
        if (!this.map) {
            return;
        }

        if (animated) {
            this.map.flyTo({ center, zoom });
            return;
        }

        this.map.easeTo({ center, zoom, duration: 0 });
    }

    fitBounds(bounds: MapBounds, padding = 32, maxZoom?: number): void {
        if (!this.map || !this.mapbox) {
            return;
        }

        const LngLatBounds = this.mapbox.LngLatBounds;
        const fit = new LngLatBounds(bounds[0], bounds[1]);
        this.map.fitBounds(fit, {
            padding,
            maxZoom,
            duration: 500,
        });
    }

    setPolyline(id: string, coords: LngLat[], style: PolylineStyle): void {
        if (!this.map || !this.ready) {
            return;
        }

        const resolvedStyle = style ?? {};

        const sid = sourceId(id);
        const lid = layerId(id);
        const source = this.map.getSource(sid);

        if (!source) {
            this.map.addSource(sid, {
                type: "geojson",
                data: asGeoJsonLine(coords),
            });

            this.map.addLayer({
                id: lid,
                type: "line",
                source: sid,
                layout: {
                    "line-cap": "round",
                    "line-join": "round",
                },
                paint: {
                    "line-color": resolvedStyle.color ?? "#0095FF",
                    "line-width": resolvedStyle.width ?? 4,
                    "line-opacity": resolvedStyle.opacity ?? 0.9,
                    "line-dasharray": resolvedStyle.dashed ? [2, 2] : undefined,
                },
            });

            return;
        }

        source.setData(asGeoJsonLine(coords));
    }

    removePolyline(id: string): void {
        if (!this.map) {
            return;
        }

        const sid = sourceId(id);
        const lid = layerId(id);

        if (this.map.getLayer(lid)) {
            this.map.removeLayer(lid);
        }

        if (this.map.getSource(sid)) {
            this.map.removeSource(sid);
        }
    }

    setMarker(id: string, coords: LngLat, element: HTMLElement, title?: string): void {
        if (!this.map || !this.mapbox) {
            return;
        }

        const existing = this.markers.get(id);
        if (existing) {
            existing.setLngLat(coords);
            return;
        }

        if (title) {
            element.title = title;
        }

        const marker = new this.mapbox.Marker({ element }) as unknown as MapboxMarker;
        marker.setLngLat(coords);
        marker.addTo(this.map);

        this.markers.set(id, marker);
    }

    updateMarkerPosition(id: string, coords: LngLat): void {
        this.markers.get(id)?.setLngLat(coords);
    }

    removeMarker(id: string): void {
        const marker = this.markers.get(id);
        if (!marker) {
            return;
        }

        marker.remove();
        this.markers.delete(id);
    }

    showPopup(coords: LngLat, html: string): void {
        if (!this.map || !this.mapbox) {
            return;
        }

        const popupId = "default";
        this.hidePopup();

        const popup = new this.mapbox.Popup({ closeButton: false, closeOnClick: false }) as unknown as MapboxPopup;
        popup.setLngLat(coords).setHTML(html).addTo(this.map);
        this.popups.set(popupId, popup);
    }

    hidePopup(): void {
        const popup = this.popups.get("default");
        popup?.remove();
        this.popups.delete("default");
    }

    on(event: MapAdapterEvent, handler: () => void): void {
        if (event !== "ready" || !this.map) {
            return;
        }

        this.map.on("load", handler);
    }

    isReady(): boolean {
        return this.ready;
    }
}
