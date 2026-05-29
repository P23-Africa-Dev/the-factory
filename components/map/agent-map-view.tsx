'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
    getGoogleMapsPublicApiKey,
    MAPBOX_PUBLIC_TOKEN_ENV,
    createMapboxTransformRequest,
    getMapboxPublicToken,
} from '@/lib/config/public-env';
import { useEffectiveMapProvider, type EffectiveMapProviderState } from '@/hooks/use-effective-map-provider';
import { useActiveTracking } from '@/components/tracking/active-tracking-provider';
import { useTrackingStore } from '@/store/tracking';
import { useTrackingWebSocket } from '@/hooks/use-tracking-ws';
import {
    areSamePoint,
    buildTaskTrail,
    createAgentMarkerElement,
    createStaticMarkerElement,
    resolveVisualTaskState,
    sanitizePolyline,
    updateAgentMarkerElement,
} from '@/lib/tracking/map-visualization';
import { fetchDirectionsRoute, clearDirectionsCache } from '@/lib/tracking/directions';
import {
    getCountryFallbackViewport,
    resolvePrivacySafeViewport,
} from '@/lib/map/default-viewport';
import { loadGoogleMapsApi } from '@/lib/map/google-loader';

const MARKER_ANIMATION_MS = 700;

type GoogleLatLng = { lat: number; lng: number };

type GoogleLatLngBoundsLike = {
    extend: (point: GoogleLatLng) => void;
};

type GoogleMapLike = {
    setCenter: (point: GoogleLatLng) => void;
    setZoom: (zoom: number) => void;
    panTo: (point: GoogleLatLng) => void;
    fitBounds: (bounds: GoogleLatLngBoundsLike, padding?: number) => void;
};

type GooglePolylineLike = {
    setMap: (map: GoogleMapLike | null) => void;
    setPath: (path: GoogleLatLng[]) => void;
};

type GoogleMarkerLike = {
    setMap: (map: GoogleMapLike | null) => void;
    setPosition: (point: GoogleLatLng) => void;
    setIcon: (icon: Record<string, unknown>) => void;
};

type GoogleMapsNamespaceLike = {
    maps: {
        Map: new (container: HTMLElement, options: Record<string, unknown>) => GoogleMapLike;
        Marker: new (options: Record<string, unknown>) => GoogleMarkerLike;
        Polyline: new (options: Record<string, unknown>) => GooglePolylineLike;
        LatLngBounds: new () => GoogleLatLngBoundsLike;
        SymbolPath: {
            CIRCLE: unknown;
        };
    };
};

function getDestinationMarkerKind(status: 'in_progress' | 'near_destination' | 'arrived' | 'completed') {
    if (status === 'completed') return 'completed' as const;
    if (status === 'near_destination') return 'near' as const;
    if (status === 'arrived') return 'arrived' as const;
    return 'destination' as const;
}

function MapboxAgentMapView({ providerState }: { providerState: EffectiveMapProviderState }) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const mapLoadedRef = useRef(false);
    const agentMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const originMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const destinationMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const markerAnimationRef = useRef<number | null>(null);
    const markerPositionRef = useRef<[number, number] | null>(null);
    const forwardRouteCoordsRef = useRef<[number, number][] | null>(null);
    const hasInitialFitRef = useRef(false);
    const lastFitTaskIdRef = useRef<number | null>(null);
    const { activeTaskId } = useActiveTracking();
    const activeTask = useTrackingStore((s) =>
        activeTaskId ? s.liveTasks[activeTaskId] ?? null : null
    );
    const token = getMapboxPublicToken();

    useTrackingWebSocket();

    const animateAgentMarker = useCallback((marker: mapboxgl.Marker, target: [number, number]) => {
        const from = markerPositionRef.current ?? [marker.getLngLat().lng, marker.getLngLat().lat] as [number, number];
        if (areSamePoint(from, target)) {
            marker.setLngLat(target);
            markerPositionRef.current = target;
            return;
        }

        if (markerAnimationRef.current) {
            cancelAnimationFrame(markerAnimationRef.current);
            markerAnimationRef.current = null;
        }

        const startedAt = performance.now();
        const step = (now: number) => {
            const progress = Math.min((now - startedAt) / MARKER_ANIMATION_MS, 1);
            const eased = progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;

            marker.setLngLat([
                from[0] + (target[0] - from[0]) * eased,
                from[1] + (target[1] - from[1]) * eased,
            ]);

            if (progress < 1) {
                markerAnimationRef.current = requestAnimationFrame(step);
                return;
            }

            markerPositionRef.current = target;
            markerAnimationRef.current = null;
        };

        markerAnimationRef.current = requestAnimationFrame(step);
    }, []);

    useEffect(() => {
        if (!mapContainer.current || mapRef.current || !token) return;
        mapboxgl.accessToken = token;
        const initialViewport = getCountryFallbackViewport();

        const map = new mapboxgl.Map({
            container: mapContainer.current,
            style: 'mapbox://styles/mapbox/light-v11',
            center: initialViewport.center,
            zoom: initialViewport.zoom,
            attributionControl: false,
            transformRequest: createMapboxTransformRequest(),
        });
        mapRef.current = map;

        map.on('load', () => {
            map.addSource('agent-route', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });
            map.addLayer({
                id: 'agent-route-casing',
                type: 'line',
                source: 'agent-route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#0095FF',
                    'line-width': 12,
                    'line-opacity': 0.3,
                },
            });
            map.addLayer({
                id: 'agent-route-line',
                type: 'line',
                source: 'agent-route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#0095FF',
                    'line-width': 8,
                    'line-opacity': 1,
                },
            });

            // Forward route layer: road-following path from agent → destination
            map.addSource('forward-routes', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });
            map.addLayer({
                id: 'forward-route-casing',
                type: 'line',
                source: 'forward-routes',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#0095FF',
                    'line-width': 12,
                    'line-opacity': 0.25,
                },
            });
            map.addLayer({
                id: 'forward-route-main',
                type: 'line',
                source: 'forward-routes',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#0095FF',
                    'line-width': 8,
                    'line-opacity': 0.9,
                },
            });

            mapLoadedRef.current = true;

        });

        return () => {
            mapLoadedRef.current = false;
            if (markerAnimationRef.current) {
                cancelAnimationFrame(markerAnimationRef.current);
                markerAnimationRef.current = null;
            }
            agentMarkerRef.current?.remove();
            originMarkerRef.current?.remove();
            destinationMarkerRef.current?.remove();
            map.remove();
            mapRef.current = null;
            agentMarkerRef.current = null;
            originMarkerRef.current = null;
            destinationMarkerRef.current = null;
            markerPositionRef.current = null;
            forwardRouteCoordsRef.current = null;
            hasInitialFitRef.current = false;
            lastFitTaskIdRef.current = null;
            clearDirectionsCache();
        };
    }, [token]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapLoadedRef.current || activeTask) return;

        let cancelled = false;

        resolvePrivacySafeViewport().then((viewport) => {
            if (cancelled || !mapRef.current || useTrackingStore.getState().activeTrackingTaskId) {
                return;
            }

            mapRef.current.easeTo({
                center: viewport.center,
                zoom: viewport.zoom,
                duration: 900,
            });
        });

        return () => {
            cancelled = true;
        };
    }, [activeTask]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapLoadedRef.current) return;

        const routeSource = map.getSource('agent-route') as mapboxgl.GeoJSONSource | undefined;
        const forwardSource = map.getSource('forward-routes') as mapboxgl.GeoJSONSource | undefined;

        if (!activeTask) {
            routeSource?.setData({ type: 'FeatureCollection', features: [] });
            forwardSource?.setData({ type: 'FeatureCollection', features: [] });
            agentMarkerRef.current?.remove();
            originMarkerRef.current?.remove();
            destinationMarkerRef.current?.remove();
            agentMarkerRef.current = null;
            originMarkerRef.current = null;
            destinationMarkerRef.current = null;
            markerPositionRef.current = null;
            hasInitialFitRef.current = false;
            lastFitTaskIdRef.current = null;
            return;
        }

        // Reset fit flag when a different task becomes active
        if (lastFitTaskIdRef.current !== null && lastFitTaskIdRef.current !== activeTask.taskId) {
            hasInitialFitRef.current = false;
        }
        lastFitTaskIdRef.current = activeTask.taskId;

        const trail = sanitizePolyline(buildTaskTrail(activeTask));
        const visualState = resolveVisualTaskState(activeTask.status, false);
        const originPoint = trail[0] ?? activeTask.lastPosition;

        routeSource?.setData({
            type: 'FeatureCollection',
            features:
                trail.length >= 2
                    ? [
                        {
                            type: 'Feature',
                            geometry: { type: 'LineString', coordinates: trail },
                            properties: { status: visualState },
                        },
                    ]
                    : [],
        });

        // Render forward routes if available
        forwardSource?.setData({
            type: 'FeatureCollection',
            features:
                forwardRouteCoordsRef.current && forwardRouteCoordsRef.current.length >= 2
                    ? [
                        {
                            type: 'Feature',
                            geometry: { type: 'LineString', coordinates: forwardRouteCoordsRef.current },
                            properties: { status: visualState },
                        },
                    ]
                    : [],
        });

        if (!originMarkerRef.current) {
            originMarkerRef.current = new mapboxgl.Marker({
                element: createStaticMarkerElement('origin'),
                anchor: 'center',
            })
                .setLngLat(originPoint)
                .addTo(map);
        } else {
            originMarkerRef.current.setLngLat(originPoint);
        }

        if (!agentMarkerRef.current) {
            const agentElement = createAgentMarkerElement({
                name: activeTask.agentName,
                avatarUrl: activeTask.agentAvatarUrl,
                visualState,
                stale: false,
            });
            agentMarkerRef.current = new mapboxgl.Marker({ element: agentElement, anchor: 'center' })
                .setLngLat(activeTask.lastPosition)
                .addTo(map);
            markerPositionRef.current = activeTask.lastPosition;
        } else {
            updateAgentMarkerElement(agentMarkerRef.current.getElement(), {
                name: activeTask.agentName,
                avatarUrl: activeTask.agentAvatarUrl,
                visualState,
                stale: false,
            });
            animateAgentMarker(agentMarkerRef.current, activeTask.lastPosition);
        }

        if (activeTask.destination) {
            const destinationLngLat: [number, number] = [
                activeTask.destination.lng,
                activeTask.destination.lat,
            ];
            const markerKind = getDestinationMarkerKind(activeTask.status);

            if (!destinationMarkerRef.current) {
                const el = createStaticMarkerElement(markerKind);
                el.dataset.kind = markerKind;
                destinationMarkerRef.current = new mapboxgl.Marker({
                    element: el,
                    anchor: 'center',
                })
                    .setLngLat(destinationLngLat)
                    .addTo(map);
            } else {
                if (destinationMarkerRef.current.getElement().dataset.kind !== markerKind) {
                    destinationMarkerRef.current.remove();
                    const el = createStaticMarkerElement(markerKind);
                    el.dataset.kind = markerKind;
                    destinationMarkerRef.current = new mapboxgl.Marker({
                        element: el,
                        anchor: 'center',
                    })
                        .setLngLat(destinationLngLat)
                        .addTo(map);
                } else {
                    destinationMarkerRef.current.setLngLat(destinationLngLat);
                }
            }
        } else if (destinationMarkerRef.current) {
            destinationMarkerRef.current.remove();
            destinationMarkerRef.current = null;
        }

        if (!hasInitialFitRef.current) {
            // First time showing this task: fit the camera to frame agent + destination + trail
            hasInitialFitRef.current = true;
            if (activeTask.destination) {
                const bounds = new mapboxgl.LngLatBounds();
                bounds.extend(activeTask.lastPosition);
                bounds.extend([activeTask.destination.lng, activeTask.destination.lat]);
                // Include recent trail so the path is visible inside the frame
                for (const pt of trail.slice(-40)) bounds.extend(pt);
                map.fitBounds(bounds, {
                    padding: { top: 120, bottom: 80, left: 60, right: 60 },
                    maxZoom: 17,
                    duration: 900,
                });
            } else {
                map.easeTo({ center: activeTask.lastPosition, zoom: 16, duration: 900 });
            }
        } else if (markerPositionRef.current && !areSamePoint(markerPositionRef.current, activeTask.lastPosition)) {
            // Subsequent position updates: follow the agent smoothly
            map.easeTo({ center: activeTask.lastPosition, duration: 700 });
        }
    }, [activeTask, animateAgentMarker]);

    // ── Fetch Mapbox Directions route ────────────────────────────────────────────
    useEffect(() => {
        if (!token || !mapLoadedRef.current || !activeTask?.destination) return;

        let cancelled = false;
        const origin = activeTask.lastPosition;
        const dest: [number, number] = [activeTask.destination.lng, activeTask.destination.lat];

        if (areSamePoint(origin, dest) || activeTask.status === 'completed') {
            forwardRouteCoordsRef.current = null;
            const src = mapRef.current?.getSource('forward-routes') as mapboxgl.GeoJSONSource | undefined;
            src?.setData({ type: 'FeatureCollection', features: [] });
            return;
        }

        fetchDirectionsRoute(origin, dest, token).then(coords => {
            if (cancelled) return;
            if (coords && coords.length >= 2) {
                forwardRouteCoordsRef.current = coords;
                const src = mapRef.current?.getSource('forward-routes') as mapboxgl.GeoJSONSource | undefined;
                src?.setData({
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        geometry: { type: 'LineString', coordinates: coords },
                        properties: {}
                    }]
                });
            }
        });

        return () => { cancelled = true; };
    }, [activeTask?.destination, activeTask?.lastPosition, activeTask?.status, token]);

    if (!token) {
        return (
            <div className="flex items-center justify-center bg-dash-bg" style={{ height: 'calc(100vh - 64px)' }}>
                <div className="bg-white rounded-3xl p-10 shadow-lg max-w-md text-center space-y-4">
                    <h2 className="text-xl font-bold text-dash-dark">Mapbox Token Required</h2>
                    <div className="bg-gray-900 text-green-400 text-sm font-mono rounded-xl p-4 text-left">
                        {MAPBOX_PUBLIC_TOKEN_ENV}=...
                    </div>
                    <p className="text-xs text-gray-400">Add it to your Next.js environment and restart the dev server.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full" style={{ height: 'calc(100vh - 64px)' }}>
            <div ref={mapContainer} className="w-full h-full" />

            {providerState.fallbackReason === 'missing_google_api_key' && providerState.requestedProvider === 'google' && (
                <div className="absolute bottom-3 left-3 right-3 rounded-md bg-black/75 px-2.5 py-1.5 text-[10px] font-medium text-white">
                    Google map is selected by admin, but NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing. Showing Mapbox fallback.
                </div>
            )}
        </div>
    );
}

function GoogleAgentMapView({ providerState }: { providerState: EffectiveMapProviderState }) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const googleRef = useRef<GoogleMapsNamespaceLike | null>(null);
    const mapRef = useRef<GoogleMapLike | null>(null);
    const routeLineRef = useRef<GooglePolylineLike | null>(null);
    const connectorLineRef = useRef<GooglePolylineLike | null>(null);
    const agentMarkerRef = useRef<GoogleMarkerLike | null>(null);
    const originMarkerRef = useRef<GoogleMarkerLike | null>(null);
    const destinationMarkerRef = useRef<GoogleMarkerLike | null>(null);
    const hasInitialFitRef = useRef(false);
    const lastFitTaskIdRef = useRef<number | null>(null);
    const googleApiKey = useMemo(() => getGoogleMapsPublicApiKey(), []);
    const { activeTaskId } = useActiveTracking();
    const activeTask = useTrackingStore((s) =>
        activeTaskId ? s.liveTasks[activeTaskId] ?? null : null
    );

    useTrackingWebSocket();

    const clearOverlays = useCallback(() => {
        routeLineRef.current?.setMap(null);
        connectorLineRef.current?.setMap(null);
        agentMarkerRef.current?.setMap(null);
        originMarkerRef.current?.setMap(null);
        destinationMarkerRef.current?.setMap(null);

        routeLineRef.current = null;
        connectorLineRef.current = null;
        agentMarkerRef.current = null;
        originMarkerRef.current = null;
        destinationMarkerRef.current = null;
    }, []);

    useEffect(() => {
        if (!mapContainer.current || mapRef.current || !googleApiKey) return;

        let cancelled = false;

        loadGoogleMapsApi(googleApiKey)
            .then((google) => {
                const googleMaps = google as unknown as GoogleMapsNamespaceLike;

                if (cancelled || !mapContainer.current) return;

                googleRef.current = googleMaps;

                const initialViewport = getCountryFallbackViewport();

                mapRef.current = new googleMaps.maps.Map(mapContainer.current, {
                    center: { lat: initialViewport.center[1], lng: initialViewport.center[0] },
                    zoom: initialViewport.zoom,
                    disableDefaultUI: false,
                    fullscreenControl: false,
                    mapTypeControl: false,
                    streetViewControl: false,
                });
            })
            .catch(() => {
                // Key/network failures surface through fallback UI.
            });

        return () => {
            cancelled = true;
            clearOverlays();
            mapRef.current = null;
            googleRef.current = null;
            hasInitialFitRef.current = false;
            lastFitTaskIdRef.current = null;
        };
    }, [clearOverlays, googleApiKey]);

    useEffect(() => {
        const map = mapRef.current;
        const google = googleRef.current;

        if (!map || !google) return;

        if (!activeTask) {
            clearOverlays();
            hasInitialFitRef.current = false;
            lastFitTaskIdRef.current = null;

            let cancelled = false;
            resolvePrivacySafeViewport().then((viewport) => {
                if (cancelled || !mapRef.current || useTrackingStore.getState().activeTrackingTaskId) {
                    return;
                }

                mapRef.current.setCenter({ lat: viewport.center[1], lng: viewport.center[0] });
                mapRef.current.setZoom(viewport.zoom);
            });

            return () => {
                cancelled = true;
            };
        }

        if (lastFitTaskIdRef.current !== null && lastFitTaskIdRef.current !== activeTask.taskId) {
            hasInitialFitRef.current = false;
        }
        lastFitTaskIdRef.current = activeTask.taskId;

        const trail = sanitizePolyline(buildTaskTrail(activeTask));
        const originPoint = trail[0] ?? activeTask.lastPosition;
        const markerKind = getDestinationMarkerKind(activeTask.status);

        if (!routeLineRef.current) {
            routeLineRef.current = new google.maps.Polyline({
                map,
                geodesic: true,
                strokeColor: '#0095FF',
                strokeOpacity: 0.92,
                strokeWeight: 4,
            });
        }

        routeLineRef.current.setPath(trail.map((point: [number, number]) => ({ lat: point[1], lng: point[0] })));

        if (activeTask.destination && !areSamePoint(activeTask.lastPosition, [activeTask.destination.lng, activeTask.destination.lat])) {
            if (!connectorLineRef.current) {
                connectorLineRef.current = new google.maps.Polyline({
                    map,
                    geodesic: true,
                    strokeColor: '#0EA5E9',
                    strokeOpacity: 0.75,
                    strokeWeight: 3,
                    icons: [{
                        icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
                        offset: '0',
                        repeat: '12px',
                    }],
                });
            }

            connectorLineRef.current.setPath([
                { lat: activeTask.lastPosition[1], lng: activeTask.lastPosition[0] },
                { lat: activeTask.destination.lat, lng: activeTask.destination.lng },
            ]);
        } else if (connectorLineRef.current) {
            connectorLineRef.current.setMap(null);
            connectorLineRef.current = null;
        }

        if (!originMarkerRef.current) {
            originMarkerRef.current = new google.maps.Marker({
                map,
                position: { lat: originPoint[1], lng: originPoint[0] },
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 7,
                    fillColor: '#2563EB',
                    fillOpacity: 1,
                    strokeColor: '#FFFFFF',
                    strokeWeight: 2,
                },
            });
        } else {
            originMarkerRef.current.setPosition({ lat: originPoint[1], lng: originPoint[0] });
        }

        if (!agentMarkerRef.current) {
            agentMarkerRef.current = new google.maps.Marker({
                map,
                position: { lat: activeTask.lastPosition[1], lng: activeTask.lastPosition[0] },
                title: activeTask.agentName,
                label: {
                    text: (activeTask.agentName || 'A').slice(0, 1).toUpperCase(),
                    color: '#FFFFFF',
                    fontWeight: '700',
                },
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 12,
                    fillColor: '#0F172A',
                    fillOpacity: 0.93,
                    strokeColor: '#FFFFFF',
                    strokeWeight: 2,
                },
            });
        } else {
            agentMarkerRef.current.setPosition({ lat: activeTask.lastPosition[1], lng: activeTask.lastPosition[0] });
        }

        if (activeTask.destination) {
            const destinationColor =
                markerKind === 'completed'
                    ? '#334155'
                    : markerKind === 'arrived'
                        ? '#16A34A'
                        : markerKind === 'near'
                            ? '#D97706'
                            : '#DC2626';

            if (!destinationMarkerRef.current) {
                destinationMarkerRef.current = new google.maps.Marker({
                    map,
                    position: { lat: activeTask.destination.lat, lng: activeTask.destination.lng },
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 8,
                        fillColor: destinationColor,
                        fillOpacity: 1,
                        strokeColor: '#FFFFFF',
                        strokeWeight: 3,
                    },
                });
            } else {
                destinationMarkerRef.current.setPosition({ lat: activeTask.destination.lat, lng: activeTask.destination.lng });
                destinationMarkerRef.current.setIcon({
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 8,
                    fillColor: destinationColor,
                    fillOpacity: 1,
                    strokeColor: '#FFFFFF',
                    strokeWeight: 3,
                });
            }
        } else if (destinationMarkerRef.current) {
            destinationMarkerRef.current.setMap(null);
            destinationMarkerRef.current = null;
        }

        if (!hasInitialFitRef.current && activeTask.destination) {
            const bounds = new google.maps.LatLngBounds();
            bounds.extend({ lat: activeTask.lastPosition[1], lng: activeTask.lastPosition[0] });
            bounds.extend({ lat: activeTask.destination.lat, lng: activeTask.destination.lng });
            trail.slice(-40).forEach((point) => bounds.extend({ lat: point[1], lng: point[0] }));
            map.fitBounds(bounds, 80);
            hasInitialFitRef.current = true;
            return;
        }

        hasInitialFitRef.current = true;
        map.panTo({ lat: activeTask.lastPosition[1], lng: activeTask.lastPosition[0] });
    }, [activeTask, clearOverlays]);

    if (!googleApiKey) {
        return (
            <div className="flex items-center justify-center bg-dash-bg" style={{ height: 'calc(100vh - 64px)' }}>
                <div className="bg-white rounded-3xl p-10 shadow-lg max-w-md text-center space-y-4">
                    <h2 className="text-xl font-bold text-dash-dark">Google Maps API Key Required</h2>
                    <div className="bg-gray-900 text-green-400 text-sm font-mono rounded-xl p-4 text-left">
                        NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...
                    </div>
                    <p className="text-xs text-gray-400">Add it to your Next.js environment and restart the dev server.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full" style={{ height: 'calc(100vh - 64px)' }}>
            <div ref={mapContainer} className="w-full h-full" />

            {providerState.fallbackReason === 'missing_mapbox_token' && providerState.requestedProvider === 'mapbox' && (
                <div className="absolute bottom-3 left-3 right-3 rounded-md bg-black/75 px-3 py-2 text-[11px] font-medium text-white">
                    Mapbox is selected by admin, but NEXT_PUBLIC_MAPBOX_TOKEN is missing. Showing Google fallback.
                </div>
            )}
        </div>
    );
}

export function AgentMapView() {
    const providerState = useEffectiveMapProvider();

    if (providerState.effectiveProvider === 'google') {
        return <GoogleAgentMapView providerState={providerState} />;
    }

    return <MapboxAgentMapView providerState={providerState} />;
}
