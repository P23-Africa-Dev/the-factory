import type {
    LngLat,
    MapAdapter,
    MapAdapterEvent,
    MapBounds,
    MapInitOptions,
    PolylineStyle,
} from "@/lib/map/types";
import { Loader } from "@googlemaps/js-api-loader";
import { getGoogleMapsApiKey } from "@/lib/config/public-env";

type GoogleLatLng = { lat: number; lng: number };

interface GoogleMapInstance {
    panTo(position: GoogleLatLng): void;
    setCenter(position: GoogleLatLng): void;
    setZoom(zoom: number): void;
    getZoom(): number;
    fitBounds(bounds: GoogleLatLngBounds, padding?: number): void;
}

interface GoogleLatLngBounds {
    extend(position: GoogleLatLng): void;
}

interface GooglePolyline {
    setMap(map: GoogleMapInstance | null): void;
    setPath(path: GoogleLatLng[]): void;
    setOptions(options: Record<string, unknown>): void;
}

interface GoogleMarker {
    setMap(map: GoogleMapInstance | null): void;
    setPosition(position: GoogleLatLng): void;
}

interface GoogleAdvancedMarker {
    map: GoogleMapInstance | null;
    position: GoogleLatLng;
}

interface GoogleInfoWindow {
    close(): void;
    open(options: { map: GoogleMapInstance }): void;
}

type GoogleMarkerLike = GoogleMarker | GoogleAdvancedMarker;

interface GoogleNamespace {
    maps: {
        Map: new (container: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
        LatLngBounds: new () => GoogleLatLngBounds;
        Polyline: new (options: Record<string, unknown>) => GooglePolyline;
        Marker: new (options: Record<string, unknown>) => GoogleMarker;
        InfoWindow: new (options: Record<string, unknown>) => GoogleInfoWindow;
        marker?: {
            AdvancedMarkerElement?: new (options: Record<string, unknown>) => GoogleAdvancedMarker;
        };
        event: {
            addListenerOnce: (instance: unknown, eventName: string, handler: () => void) => unknown;
        };
    };
}

declare global {
    interface Window {
        google?: GoogleNamespace;
    }
}

let googleSdkState: { apiKey: string; promise: Promise<GoogleNamespace> } | null = null;

function toLatLng(coords: LngLat) {
    return { lat: coords[1], lng: coords[0] };
}

async function loadGoogleMapsSdk(apiKey: string): Promise<GoogleNamespace> {
    if (typeof window === "undefined") {
        throw new Error("Google Maps SDK can only be loaded in the browser.");
    }

    if (window.google?.maps) {
        return window.google;
    }

    if (googleSdkState && googleSdkState.apiKey === apiKey) {
        return googleSdkState.promise;
    }

    const loader = new Loader({
        apiKey,
        version: "weekly",
        libraries: ["marker"],
    });

    const promise = (async () => {
        await loader.importLibrary("maps");
        await loader.importLibrary("marker");

        if (!window.google?.maps) {
            throw new Error("Google Maps SDK loaded but namespace is unavailable.");
        }

        return window.google;
    })();

    googleSdkState = {
        apiKey,
        promise,
    };

    return promise;
}

function getGoogleApiKey(options: MapInitOptions): string {
    const fromOptions = options.google?.apiKey?.trim();
    if (fromOptions) {
        return fromOptions;
    }

    const fromEnv = getGoogleMapsApiKey();
    if (fromEnv) {
        return fromEnv;
    }

    throw new Error("Google Maps API key is missing.");
}

export class GoogleAdapter implements MapAdapter {
    private google: GoogleNamespace | null = null;
    private map: GoogleMapInstance | null = null;
    private ready = false;
    private markers = new Map<string, GoogleMarkerLike>();
    private polylines = new Map<string, GooglePolyline>();
    private popup: GoogleInfoWindow | null = null;

    async init(container: HTMLElement, options: MapInitOptions): Promise<void> {
        const apiKey = getGoogleApiKey(options);
        this.google = await loadGoogleMapsSdk(apiKey);

        this.map = new this.google.maps.Map(container, {
            center: toLatLng(options.center),
            zoom: options.zoom,
            minZoom: options.minZoom,
            maxZoom: options.maxZoom,
            disableDefaultUI: false,
            mapId: options.google?.mapId,
            gestureHandling: options.interactive === false ? "none" : "auto",
            keyboardShortcuts: options.interactive ?? true,
            clickableIcons: true,
        });

        this.ready = true;
    }

    destroy(): void {
        this.markers.forEach((marker) => {
            if ("map" in marker) {
                marker.map = null;
            }
            if ("setMap" in marker) {
                marker.setMap(null);
            }
        });
        this.markers.clear();

        this.polylines.forEach((line) => line.setMap(null));
        this.polylines.clear();

        if (this.popup) {
            this.popup.close();
            this.popup = null;
        }

        this.map = null;
        this.ready = false;
    }

    setCenter(center: LngLat, zoom?: number, animated = true): void {
        if (!this.map) {
            return;
        }

        const position = toLatLng(center);
        if (animated) {
            this.map.panTo(position);
        } else {
            this.map.setCenter(position);
        }

        if (typeof zoom === "number") {
            this.map.setZoom(zoom);
        }
    }

    fitBounds(bounds: MapBounds, padding = 32, maxZoom?: number): void {
        if (!this.map || !this.google) {
            return;
        }

        const llb = new this.google.maps.LatLngBounds();
        llb.extend(toLatLng(bounds[0]));
        llb.extend(toLatLng(bounds[1]));

        this.map.fitBounds(llb, padding);

        if (typeof maxZoom === "number") {
            const listener = this.google.maps.event.addListenerOnce(this.map, "bounds_changed", () => {
                if (this.map.getZoom() > maxZoom) {
                    this.map.setZoom(maxZoom);
                }
            });
            void listener;
        }
    }

    setPolyline(id: string, coords: LngLat[], style: PolylineStyle): void {
        if (!this.map || !this.google) {
            return;
        }

        const resolvedStyle = style ?? {};

        const path = coords.map(toLatLng);
        const existing = this.polylines.get(id);

        if (existing) {
            existing.setPath(path);
            existing.setOptions({
                strokeColor: resolvedStyle.color ?? "#0095FF",
                strokeWeight: resolvedStyle.width ?? 4,
                strokeOpacity: resolvedStyle.opacity ?? 0.9,
                zIndex: resolvedStyle.zIndex,
                icons: resolvedStyle.dashed
                    ? [
                        {
                            icon: {
                                path: "M 0,-1 0,1",
                                strokeOpacity: 1,
                                scale: 3,
                            },
                            offset: "0",
                            repeat: "10px",
                        },
                    ]
                    : undefined,
            });
            return;
        }

        const polyline = new this.google.maps.Polyline({
            path,
            geodesic: true,
            strokeColor: resolvedStyle.color ?? "#0095FF",
            strokeWeight: resolvedStyle.width ?? 4,
            strokeOpacity: resolvedStyle.opacity ?? 0.9,
            zIndex: resolvedStyle.zIndex,
            map: this.map,
            icons: resolvedStyle.dashed
                ? [
                    {
                        icon: {
                            path: "M 0,-1 0,1",
                            strokeOpacity: 1,
                            scale: 3,
                        },
                        offset: "0",
                        repeat: "10px",
                    },
                ]
                : undefined,
        });

        this.polylines.set(id, polyline);
    }

    removePolyline(id: string): void {
        const polyline = this.polylines.get(id);
        if (!polyline) {
            return;
        }

        polyline.setMap(null);
        this.polylines.delete(id);
    }

    setMarker(id: string, coords: LngLat, element: HTMLElement, title?: string): void {
        if (!this.map || !this.google) {
            return;
        }

        const existing = this.markers.get(id);
        if (existing) {
            this.updateMarkerPosition(id, coords);
            return;
        }

        const position = toLatLng(coords);

        const AdvancedMarker = this.google.maps.marker?.AdvancedMarkerElement;
        if (AdvancedMarker) {
            const marker = new AdvancedMarker({
                map: this.map,
                position,
                content: element,
                title,
            });
            this.markers.set(id, marker);
            return;
        }

        const marker = new this.google.maps.Marker({
            map: this.map,
            position,
            title,
        });
        this.markers.set(id, marker);
    }

    updateMarkerPosition(id: string, coords: LngLat): void {
        const marker = this.markers.get(id);
        if (!marker) {
            return;
        }

        const position = toLatLng(coords);

        if ("position" in marker) {
            marker.position = position;
            return;
        }

        if ("setPosition" in marker) {
            marker.setPosition(position);
        }
    }

    removeMarker(id: string): void {
        const marker = this.markers.get(id);
        if (!marker) {
            return;
        }

        if ("map" in marker) {
            marker.map = null;
        }

        if ("setMap" in marker) {
            marker.setMap(null);
        }

        this.markers.delete(id);
    }

    showPopup(coords: LngLat, html: string): void {
        if (!this.map || !this.google) {
            return;
        }

        this.hidePopup();

        this.popup = new this.google.maps.InfoWindow({
            content: html,
            position: toLatLng(coords),
            disableAutoPan: false,
        });

        this.popup.open({ map: this.map });
    }

    hidePopup(): void {
        if (!this.popup) {
            return;
        }

        this.popup.close();
        this.popup = null;
    }

    on(event: MapAdapterEvent, handler: () => void): void {
        if (!this.map || event !== "ready" || !this.google) {
            return;
        }

        this.google.maps.event.addListenerOnce(this.map, "idle", handler);
    }

    isReady(): boolean {
        return this.ready;
    }
}
