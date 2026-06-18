'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { env } from '@/constants/env';
import { createMapboxTransformRequest, getMapboxPublicToken } from '@/lib/map/public-env';
import { getAgentMapboxStyle } from '@/lib/map/style-mode';
import {
  createAgentMarkerElement,
  createDestinationMarkerElement,
  updateAgentMarkerElement,
  type DestinationMarkerKind,
} from '@/lib/map/map-markers';
import { agentDebugLog } from '@/lib/debug-ingest';

export type MapboxMapMode = 'preview' | 'navigation';

export type MapboxMapProps = {
  agentPosition: [number, number] | null;
  destinationPosition: [number, number] | null;
  /** @deprecated Use traveledCoords + remainingRouteCoords */
  polylineCoords?: [number, number][];
  /** @deprecated Use remainingRouteCoords */
  plannedRouteCoords?: [number, number][];
  traveledCoords?: [number, number][];
  remainingRouteCoords?: [number, number][];
  mode?: MapboxMapMode;
  agentMarker?: {
    displayName: string;
    avatarUrl?: string | null;
    preferInitials?: boolean;
    headingDegrees?: number | null;
  };
  destinationMarkerKind?: DestinationMarkerKind;
  radiusMeters: number | null;
  arrived: boolean;
  dimmed?: boolean;
};

function emptyLine(): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: [[0, 0]] },
  };
}

function lineFeature(coords: [number, number][]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: coords.length > 1 ? coords : [[0, 0]],
    },
  };
}

function getCirclePolygon(center: [number, number], radiusInMeters: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords = { latitude: center[1], longitude: center[0] };
  const km = radiusInMeters / 1000;
  const distanceX = km / (111.32 * Math.cos((coords.latitude * Math.PI) / 180));
  const distanceY = km / 110.574;
  const ret: [number, number][] = [];
  const points = 64;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    ret.push([coords.longitude + distanceX * Math.cos(theta), coords.latitude + distanceY * Math.sin(theta)]);
  }
  ret.push(ret[0]);

  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [ret] },
  };
}

function coordsSignature(coords: [number, number][]): string {
  if (coords.length < 2) return String(coords.length);
  const first = coords[0];
  const last = coords[coords.length - 1];
  return `${coords.length}:${first[0].toFixed(5)},${first[1].toFixed(5)}:${last[0].toFixed(5)},${last[1].toFixed(5)}`;
}

function findFirstSymbolLayerId(map: mapboxgl.Map): string | undefined {
  const layers = map.getStyle()?.layers;
  if (!layers) return undefined;
  for (const layer of layers) {
    if (layer.type === 'symbol') return layer.id;
  }
  return undefined;
}

function emptyPolygon(): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] },
  };
}

function ensureGeofenceLayers(map: mapboxgl.Map): void {
  const beforeId = findFirstSymbolLayerId(map);

  if (!map.getSource('geofence')) {
    map.addSource('geofence', { type: 'geojson', data: emptyPolygon() });
    map.addLayer(
      {
        id: 'geofence-fill',
        type: 'fill',
        source: 'geofence',
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#FD6046', 'fill-opacity': 0.15 },
      },
      beforeId,
    );
    map.addLayer(
      {
        id: 'geofence-outline',
        type: 'line',
        source: 'geofence',
        layout: { visibility: 'none' },
        paint: {
          'line-color': '#FD6046',
          'line-width': 1.5,
          'line-opacity': 0.6,
        },
      },
      beforeId,
    );
  }
}

function addRouteLayers(map: mapboxgl.Map): void {
  if (!map.getSource('route-traveled')) {
    map.addSource('route-traveled', { type: 'geojson', data: emptyLine() });
    map.addLayer({
      id: 'route-traveled-line',
      type: 'line',
      source: 'route-traveled',
      layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
      paint: { 'line-color': '#94A3B8', 'line-width': 5, 'line-opacity': 0.85 },
    });
  }

  if (!map.getSource('route-remaining')) {
    map.addSource('route-remaining', { type: 'geojson', data: emptyLine() });
    map.addLayer({
      id: 'route-remaining-casing',
      type: 'line',
      source: 'route-remaining',
      layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
      paint: { 'line-color': '#FFFFFF', 'line-width': 10, 'line-opacity': 0.35 },
    });
    map.addLayer({
      id: 'route-remaining-main',
      type: 'line',
      source: 'route-remaining',
      layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
      paint: { 'line-color': '#0095FF', 'line-width': 7, 'line-opacity': 1 },
    });
  }
}

function routeLayerVisibility(map: mapboxgl.Map): Record<string, string | undefined> {
  const ids = ['route-remaining-main', 'route-remaining-casing', 'route-traveled-line', 'geofence-fill'];
  const out: Record<string, string | undefined> = {};
  for (const id of ids) {
    if (map.getLayer(id)) {
      out[id] = map.getLayoutProperty(id, 'visibility') as string | undefined;
    }
  }
  return out;
}

function applyRouteData(
  map: mapboxgl.Map,
  mode: MapboxMapMode,
  effectiveTraveled: [number, number][],
  effectiveRemaining: [number, number][],
): void {
  addRouteLayers(map);

  const traveledSource = map.getSource('route-traveled') as mapboxgl.GeoJSONSource | undefined;
  const remainingSource = map.getSource('route-remaining') as mapboxgl.GeoJSONSource | undefined;

  if (mode === 'navigation' && effectiveTraveled.length >= 1) {
    const traveledCoords =
      effectiveTraveled.length > 1
        ? effectiveTraveled
        : [effectiveTraveled[0], effectiveTraveled[0]];
    traveledSource?.setData(lineFeature(traveledCoords));
    if (map.getLayer('route-traveled-line')) {
      map.setLayoutProperty('route-traveled-line', 'visibility', 'visible');
    }
  } else if (map.getLayer('route-traveled-line')) {
    map.setLayoutProperty('route-traveled-line', 'visibility', 'none');
  }

  if (effectiveRemaining.length > 1) {
    remainingSource?.setData(lineFeature(effectiveRemaining));
    if (map.getLayer('route-remaining-casing')) {
      map.setLayoutProperty('route-remaining-casing', 'visibility', 'visible');
    }
    if (map.getLayer('route-remaining-main')) {
      map.setLayoutProperty('route-remaining-main', 'visibility', 'visible');
    }
  } else {
    if (map.getLayer('route-remaining-casing')) {
      map.setLayoutProperty('route-remaining-casing', 'visibility', 'none');
    }
    if (map.getLayer('route-remaining-main')) {
      map.setLayoutProperty('route-remaining-main', 'visibility', 'none');
    }
  }
}

export function MapboxMap({
  agentPosition,
  destinationPosition,
  polylineCoords = [],
  plannedRouteCoords = [],
  traveledCoords,
  remainingRouteCoords,
  mode = 'preview',
  agentMarker,
  destinationMarkerKind = 'place',
  radiusMeters,
  arrived,
  dimmed = false,
}: MapboxMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const agentMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const destMarkerKindRef = useRef<DestinationMarkerKind | null>(null);
  const mapLoadedRef = useRef(false);
  const enteredNavigationRef = useRef(false);
  const previewFitDoneRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  const effectiveTraveled = traveledCoords ?? (mode === 'navigation' ? polylineCoords : []);
  const effectiveRemaining = remainingRouteCoords ?? plannedRouteCoords;

  const agentLng = agentPosition?.[0] ?? null;
  const agentLat = agentPosition?.[1] ?? null;
  const destLng = destinationPosition?.[0] ?? null;
  const destLat = destinationPosition?.[1] ?? null;
  const traveledSig = useMemo(() => coordsSignature(effectiveTraveled), [effectiveTraveled]);
  const remainingSig = useMemo(() => coordsSignature(effectiveRemaining), [effectiveRemaining]);

  const syncPayloadRef = useRef({
    mode,
    effectiveTraveled,
    effectiveRemaining,
    agentPosition,
    destinationPosition,
    agentMarker,
    destinationMarkerKind,
    radiusMeters,
    arrived,
  });
  syncPayloadRef.current = {
    mode,
    effectiveTraveled,
    effectiveRemaining,
    agentPosition,
    destinationPosition,
    agentMarker,
    destinationMarkerKind,
    radiusMeters,
    arrived,
  };

  const fallbackView = (
    <div className="absolute inset-0 bg-[#0A1D25] flex items-center justify-center overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/default-map-bg.png"
        alt="Map fallback"
        className="w-full h-full object-cover opacity-60"
      />
    </div>
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current || mapRef.current) return;

    const mapboxToken = getMapboxPublicToken() || env.MAPBOX_TOKEN;
    if (!mapboxToken) {
      setTimeout(() => setMapError(true), 0);
      return;
    }

    try {
      mapboxgl.accessToken = mapboxToken;
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: getAgentMapboxStyle(),
        center: agentPosition || destinationPosition || [8.6753, 9.0820],
        zoom: 14,
        attributionControl: false,
        transformRequest: createMapboxTransformRequest(),
      });

      map.on('error', (e) => {
        console.warn('Mapbox error:', e);
        setTimeout(() => setMapError(true), 0);
      });

      map.on('load', () => {
        map.resize();
        ensureGeofenceLayers(map);
        addRouteLayers(map);
        mapLoadedRef.current = true;
        setMapReady(true);
      });

      mapRef.current = map;
    } catch (err) {
      console.warn('Failed to initialize Mapbox:', err);
      setTimeout(() => setMapError(true), 0);
    }

    return () => {
      mapLoadedRef.current = false;
      previewFitDoneRef.current = false;
      enteredNavigationRef.current = false;
      setMapReady(false);
      agentMarkerRef.current?.remove();
      agentMarkerRef.current = null;
      destMarkerRef.current?.remove();
      destMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !mapLoadedRef.current) return;

    const syncMap = () => {
      const {
        mode: mapMode,
        effectiveTraveled: traveled,
        effectiveRemaining: remaining,
        agentPosition: agentPos,
        destinationPosition: destPos,
        agentMarker: marker,
        destinationMarkerKind: destKind,
        radiusMeters: radius,
        arrived: isArrived,
      } = syncPayloadRef.current;

      const geofenceSource = map.getSource('geofence') as mapboxgl.GeoJSONSource | undefined;
      if (destPos && radius != null && geofenceSource) {
        geofenceSource.setData(getCirclePolygon(destPos, radius));
        if (map.getLayer('geofence-fill')) {
          map.setLayoutProperty('geofence-fill', 'visibility', 'visible');
          map.setPaintProperty('geofence-fill', 'fill-color', isArrived ? '#7BB6B8' : '#FD6046');
        }
        if (map.getLayer('geofence-outline')) {
          map.setLayoutProperty('geofence-outline', 'visibility', 'visible');
          map.setPaintProperty('geofence-outline', 'line-color', isArrived ? '#7BB6B8' : '#FD6046');
        }
      } else {
        if (map.getLayer('geofence-fill')) {
          map.setLayoutProperty('geofence-fill', 'visibility', 'none');
        }
        if (map.getLayer('geofence-outline')) {
          map.setLayoutProperty('geofence-outline', 'visibility', 'none');
        }
      }

      applyRouteData(map, mapMode, traveled, remaining);

      const styleLoadedAfter = map.isStyleLoaded();
      agentDebugLog({
        location: 'MapboxMap.tsx:syncMap',
        message: 'Route layers synced',
        hypothesisId: 'H11-H16',
        runId: 'post-fix-4',
        data: {
          mapMode,
          traveledLen: traveled.length,
          remainingLen: remaining.length,
          styleLoaded: styleLoadedAfter,
          hasGeofence: Boolean(destPos && radius != null),
          layerVisibility: routeLayerVisibility(map),
        },
      });

      if (!styleLoadedAfter && remaining.length > 1) {
        map.once('idle', () => {
          const payload = syncPayloadRef.current;
          applyRouteData(map, payload.mode, payload.effectiveTraveled, payload.effectiveRemaining);
          agentDebugLog({
            location: 'MapboxMap.tsx:idleReapply',
            message: 'Route re-applied after idle',
            hypothesisId: 'H20',
            runId: 'post-fix-4',
            data: {
              remainingLen: payload.effectiveRemaining.length,
              styleLoaded: map.isStyleLoaded(),
              layerVisibility: routeLayerVisibility(map),
            },
          });
        });
      }

      if (
        mapMode === 'preview' &&
        !previewFitDoneRef.current &&
        remaining.length > 1 &&
        destPos
      ) {
        previewFitDoneRef.current = true;
        const bounds = new mapboxgl.LngLatBounds();
        for (const coord of remaining) bounds.extend(coord);
        if (agentPos) bounds.extend(agentPos);
        bounds.extend(destPos);
        map.fitBounds(bounds, { padding: 72, duration: 800, maxZoom: 15 });
        agentDebugLog({
          location: 'MapboxMap.tsx:previewFit',
          message: 'Preview fitBounds',
          hypothesisId: 'H22',
          runId: 'post-fix-4',
          data: { hasAgent: Boolean(agentPos), remainingLen: remaining.length },
        });
      }

      if (agentPos && marker) {
        const markerInput = {
          displayName: marker.displayName,
          avatarUrl: marker.avatarUrl,
          preferInitials: marker.preferInitials,
        };

        if (agentMarkerRef.current) {
          agentMarkerRef.current.setLngLat(agentPos);
          updateAgentMarkerElement(agentMarkerRef.current.getElement(), markerInput);
        } else {
          const el = createAgentMarkerElement(markerInput);
          agentMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat(agentPos)
            .addTo(map);
        }

        const heading = marker.headingDegrees;
        if (heading != null && Number.isFinite(heading)) {
          agentMarkerRef.current.getElement().style.transform = `rotate(${heading}deg)`;
        }

        const duration = mapMode === 'navigation' ? 400 : 800;
        const zoom = mapMode === 'navigation' ? 16 : 15;

        if (mapMode === 'navigation' && !enteredNavigationRef.current && destPos) {
          enteredNavigationRef.current = true;
          const bounds = new mapboxgl.LngLatBounds();
          bounds.extend(agentPos);
          bounds.extend(destPos);
          map.fitBounds(bounds, { padding: 80, duration: 900, maxZoom: 16 });
        } else if (mapMode === 'navigation' || remaining.length <= 1) {
          map.easeTo({ center: agentPos, zoom, duration });
        }
      } else if (agentMarkerRef.current) {
        agentMarkerRef.current.remove();
        agentMarkerRef.current = null;
      }

      if (destPos) {
        const kind = destKind;
        if (destMarkerRef.current && destMarkerKindRef.current !== kind) {
          destMarkerRef.current.remove();
          destMarkerRef.current = null;
        }

        if (destMarkerRef.current) {
          destMarkerRef.current.setLngLat(destPos);
        } else {
          const el = createDestinationMarkerElement({ kind, arrived: isArrived });
          destMarkerKindRef.current = kind;
          destMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat(destPos)
            .addTo(map);
        }
      } else if (destMarkerRef.current) {
        destMarkerRef.current.remove();
        destMarkerRef.current = null;
        destMarkerKindRef.current = null;
      }
    };

    const runSync = () => {
      syncMap();
    };

    runSync();
  }, [
    mapReady,
    agentLng,
    agentLat,
    destLng,
    destLat,
    traveledSig,
    remainingSig,
    mode,
    agentMarker?.displayName,
    agentMarker?.avatarUrl,
    agentMarker?.preferInitials,
    agentMarker?.headingDegrees,
    destinationMarkerKind,
    radiusMeters,
    arrived,
  ]);

  useEffect(() => {
    previewFitDoneRef.current = false;
  }, [remainingSig, destLng, destLat]);

  useEffect(() => {
    if (mode !== 'navigation') {
      enteredNavigationRef.current = false;
    }
  }, [mode]);

  if (mapError) {
    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center">
        {fallbackView}
        {dimmed && <div className="absolute inset-0 bg-black/45 pointer-events-none" />}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full agent-mapbox-surface">
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />
      {dimmed && <div className="absolute inset-0 bg-black/45 pointer-events-none" />}
    </div>
  );
}

export default React.memo(MapboxMap);
