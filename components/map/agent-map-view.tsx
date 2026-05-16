'use client';

import { useEffect, useRef } from 'react';
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

const DEFAULT_CENTER: [number, number] = [3.36, 6.595];

function buildAgentElement(): HTMLDivElement {
    const el = document.createElement('div');
    el.className =
        'w-5 h-5 rounded-full bg-dash-teal border-4 border-white shadow-lg ring-4 ring-dash-teal/30';
    return el;
}

function buildDestinationElement(): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'w-5 h-5 rounded-full bg-purple-500 border-4 border-white shadow-lg';
    return el;
}

export function AgentMapView() {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const agentMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const destinationMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const { activeTaskId } = useActiveTracking();
    const activeTask = useTrackingStore((s) =>
        activeTaskId ? s.liveTasks[activeTaskId] ?? null : null
    );
    const token = getMapboxPublicToken();

    useTrackingWebSocket();

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
                id: 'agent-route-line',
                type: 'line',
                source: 'agent-route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#3B82F6',
                    'line-width': 4,
                    'line-opacity': 0.8,
                },
            });

        });

        return () => {
            agentMarkerRef.current?.remove();
            destinationMarkerRef.current?.remove();
            map.remove();
            mapRef.current = null;
            agentMarkerRef.current = null;
            destinationMarkerRef.current = null;
        };
    }, [token]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const routeSource = map.getSource('agent-route') as mapboxgl.GeoJSONSource | undefined;

        if (!activeTask) {
            routeSource?.setData({ type: 'FeatureCollection', features: [] });
            agentMarkerRef.current?.remove();
            destinationMarkerRef.current?.remove();
            agentMarkerRef.current = null;
            destinationMarkerRef.current = null;
            return;
        }

        routeSource?.setData({
            type: 'FeatureCollection',
            features:
                activeTask.polyline.length >= 2
                    ? [
                        {
                            type: 'Feature',
                            geometry: { type: 'LineString', coordinates: activeTask.polyline },
                            properties: {},
                        },
                    ]
                    : [],
        });

        if (!agentMarkerRef.current) {
            agentMarkerRef.current = new mapboxgl.Marker({ element: buildAgentElement() })
                .setLngLat(activeTask.lastPosition)
                .addTo(map);
        } else {
            agentMarkerRef.current.setLngLat(activeTask.lastPosition);
        }

        if (activeTask.destination) {
            const destinationLngLat: [number, number] = [
                activeTask.destination.lng,
                activeTask.destination.lat,
            ];

            if (!destinationMarkerRef.current) {
                destinationMarkerRef.current = new mapboxgl.Marker({
                    element: buildDestinationElement(),
                })
                    .setLngLat(destinationLngLat)
                    .addTo(map);
            } else {
                destinationMarkerRef.current.setLngLat(destinationLngLat);
            }
        } else if (destinationMarkerRef.current) {
            destinationMarkerRef.current.remove();
            destinationMarkerRef.current = null;
        }

        map.easeTo({ center: activeTask.lastPosition, duration: 800 });
    }, [activeTask]);

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