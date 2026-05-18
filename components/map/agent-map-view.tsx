'use client';

import { useCallback, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
    MAPBOX_PUBLIC_TOKEN_ENV,
    createMapboxTransformRequest,
    getMapboxPublicToken,
} from '@/lib/config/public-env';
import { useActiveTracking } from '@/components/tracking/active-tracking-provider';
import { useTrackingStore } from '@/store/tracking';
import { useTrackingWebSocket } from '@/hooks/use-tracking-ws';
import {
    areSamePoint,
    buildDirectionSegment,
    buildTaskTrail,
    createAgentMarkerElement,
    createStaticMarkerElement,
    resolveVisualTaskState,
    sanitizePolyline,
    updateAgentMarkerElement,
    VISUAL_PALETTE,
} from '@/lib/tracking/map-visualization';

const DEFAULT_CENTER: [number, number] = [3.36, 6.595];
const MARKER_ANIMATION_MS = 700;

function getDestinationMarkerKind(status: 'in_progress' | 'near_destination' | 'arrived' | 'completed') {
    if (status === 'completed') return 'completed' as const;
    if (status === 'near_destination') return 'near' as const;
    if (status === 'arrived') return 'arrived' as const;
    return 'destination' as const;
}

export function AgentMapView() {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const mapLoadedRef = useRef(false);
    const agentMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const originMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const destinationMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const markerAnimationRef = useRef<number | null>(null);
    const markerPositionRef = useRef<[number, number] | null>(null);
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

        const map = new mapboxgl.Map({
            container: mapContainer.current,
            style: 'mapbox://styles/mapbox/light-v11',
            center: DEFAULT_CENTER,
            zoom: 12,
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
                    'line-color': '#FFFFFF',
                    'line-width': 8,
                    'line-opacity': 0.7,
                },
            });
            map.addLayer({
                id: 'agent-route-line',
                type: 'line',
                source: 'agent-route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'status'],
                        'near_destination',
                        VISUAL_PALETTE.near_destination.trail,
                        'arrived',
                        VISUAL_PALETTE.arrived.trail,
                        'completed',
                        VISUAL_PALETTE.completed.trail,
                        VISUAL_PALETTE.in_progress.trail,
                    ],
                    'line-width': 4,
                    'line-opacity': 0.9,
                },
            });

            map.addSource('agent-route-connector', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });
            map.addLayer({
                id: 'agent-route-connector-line',
                type: 'line',
                source: 'agent-route-connector',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'status'],
                        'near_destination',
                        VISUAL_PALETTE.near_destination.connector,
                        'arrived',
                        VISUAL_PALETTE.arrived.connector,
                        'completed',
                        VISUAL_PALETTE.completed.connector,
                        VISUAL_PALETTE.in_progress.connector,
                    ],
                    'line-width': 3,
                    'line-opacity': 0.85,
                    'line-dasharray': [2, 2],
                },
            });

            map.addSource('agent-route-direction', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });
            map.addLayer({
                id: 'agent-route-direction-line',
                type: 'line',
                source: 'agent-route-direction',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'status'],
                        'near_destination',
                        '#D97706',
                        'arrived',
                        '#15803D',
                        'completed',
                        '#1E293B',
                        '#075985',
                    ],
                    'line-width': 5,
                    'line-opacity': 0.95,
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
        };
    }, [token]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapLoadedRef.current) return;

        const routeSource = map.getSource('agent-route') as mapboxgl.GeoJSONSource | undefined;
        const connectorSource = map.getSource('agent-route-connector') as mapboxgl.GeoJSONSource | undefined;
        const directionSource = map.getSource('agent-route-direction') as mapboxgl.GeoJSONSource | undefined;

        if (!activeTask) {
            routeSource?.setData({ type: 'FeatureCollection', features: [] });
            connectorSource?.setData({ type: 'FeatureCollection', features: [] });
            directionSource?.setData({ type: 'FeatureCollection', features: [] });
            agentMarkerRef.current?.remove();
            originMarkerRef.current?.remove();
            destinationMarkerRef.current?.remove();
            agentMarkerRef.current = null;
            originMarkerRef.current = null;
            destinationMarkerRef.current = null;
            markerPositionRef.current = null;
            return;
        }

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

        if (activeTask.destination && !areSamePoint(activeTask.lastPosition, [activeTask.destination.lng, activeTask.destination.lat])) {
            connectorSource?.setData({
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: [activeTask.lastPosition, [activeTask.destination.lng, activeTask.destination.lat]],
                        },
                        properties: { status: visualState },
                    },
                ],
            });
        } else {
            connectorSource?.setData({ type: 'FeatureCollection', features: [] });
        }

        const directionSegment = buildDirectionSegment(trail);
        directionSource?.setData({
            type: 'FeatureCollection',
            features: directionSegment
                ? [
                    {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: directionSegment,
                        },
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

        if (!markerPositionRef.current || !areSamePoint(markerPositionRef.current, activeTask.lastPosition)) {
            map.easeTo({ center: activeTask.lastPosition, duration: 700 });
        }
    }, [activeTask, animateAgentMarker]);

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

    return <div ref={mapContainer} className="w-full" style={{ height: 'calc(100vh - 64px)' }} />;
}