export type MapProvider = "mapbox" | "google";

export type LngLat = [lng: number, lat: number];

export type MapBounds = [southWest: LngLat, northEast: LngLat];

export type PolylineStyle = {
    color?: string;
    width?: number;
    opacity?: number;
    dashed?: boolean;
    zIndex?: number;
};

export type MapboxInitOptions = {
    accessToken?: string;
    style?: string;
    transformRequest?: (url: string) => { url: string };
};

export type GoogleInitOptions = {
    apiKey?: string;
    mapId?: string;
};

export type MapInitOptions = {
    center: LngLat;
    zoom: number;
    minZoom?: number;
    maxZoom?: number;
    interactive?: boolean;
    mapbox?: MapboxInitOptions;
    google?: GoogleInitOptions;
};

export type MapAdapterEvent = "ready";

export interface MapAdapter {
    init(container: HTMLElement, options: MapInitOptions): Promise<void>;
    destroy(): void;
    setCenter(center: LngLat, zoom?: number, animated?: boolean): void;
    fitBounds(bounds: MapBounds, padding?: number, maxZoom?: number): void;
    setPolyline(id: string, coords: LngLat[], style: PolylineStyle): void;
    removePolyline(id: string): void;
    setMarker(id: string, coords: LngLat, element: HTMLElement, title?: string): void;
    updateMarkerPosition(id: string, coords: LngLat): void;
    removeMarker(id: string): void;
    showPopup(coords: LngLat, html: string): void;
    hidePopup(): void;
    on(event: MapAdapterEvent, handler: () => void): void;
    isReady(): boolean;
}
