'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { AlertCircle, RefreshCw, Map as MapIcon, Navigation } from 'lucide-react';

import { env } from '@/constants/env';
import { createMapboxTransformRequest, getMapboxPublicToken } from '@/lib/map/public-env';
import { getAgentMapboxStyle } from '@/lib/map/style-mode';
import {
  createAgentMarkerElement,
  createClockInMarkerElement,
  createDestinationMarkerElement,
  createSavedLocationMarkerElement,
  updateAgentMarkerElement,
  type DestinationMarkerKind,
} from '@/lib/map/map-markers';
import { resolveNavigationBearing, smoothBearingDegrees } from '@/lib/map/route-geometry';

export type MapboxMapMode = 'preview' | 'navigation';

export type SavedLocationPin = {
  id: number;
  name: string;
  type?: string | null;
  longitude: number;
  latitude: number;
  color: string;
  selected?: boolean;
};

const NAV_CAMERA_PADDING = { top: 120, bottom: 220, left: 48, right: 48 };
const NAV_PITCH = 55;
const NAV_ZOOM = 17;
const MARKER_ANIMATION_MS = 850;

// Treat positions within ~0.5m as identical to avoid jitter from GPS noise.
function arePointsClose(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < 5e-6 && Math.abs(a[1] - b[1]) < 5e-6;
}

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
    speedMps?: number | null;
  };
  destinationMarkerKind?: DestinationMarkerKind;
  radiusMeters: number | null;
  arrived: boolean;
  dimmed?: boolean;
  savedLocations?: SavedLocationPin[];
  onSavedLocationClick?: (id: number) => void;
  clockInPin?: {
    longitude: number;
    latitude: number;
    agentName: string;
    avatarUrl?: string | null;
    isLate?: boolean;
  } | null;
  pinMode?: boolean;
  onMapPin?: (lng: number, lat: number) => void;
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
  savedLocations,
  onSavedLocationClick,
  clockInPin = null,
  pinMode = false,
  onMapPin,
}: MapboxMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const agentMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const markerAnimationRef = useRef<number | null>(null);
  const markerPositionRef = useRef<[number, number] | null>(null);
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const destMarkerKindRef = useRef<DestinationMarkerKind | null>(null);
  const savedMarkersRef = useRef<Map<number, mapboxgl.Marker>>(new Map());
  const clockInMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const pinModeRef = useRef(pinMode);
  const onMapPinRef = useRef(onMapPin);
  const onSavedLocationClickRef = useRef(onSavedLocationClick);
  const mapLoadedRef = useRef(false);
  const enteredNavigationRef = useRef(false);
  const previewFitDoneRef = useRef(false);
  const mapBearingRef = useRef(0);
  const wasNavigationRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [isManual, setIsManual] = useState(false);
  const isManualRef = useRef(false);

  // Smoothly tween the agent marker between GPS fixes (rAF lerp) so movement
  // reads as continuous instead of teleporting on each update.
  const animateAgentMarker = useCallback(
    (marker: mapboxgl.Marker, target: [number, number], durationMs: number) => {
      const current = marker.getLngLat();
      const from = markerPositionRef.current ?? [current.lng, current.lat];

      if (arePointsClose(from, target)) {
        marker.setLngLat(target);
        markerPositionRef.current = target;
        return;
      }

      if (markerAnimationRef.current !== null) {
        cancelAnimationFrame(markerAnimationRef.current);
        markerAnimationRef.current = null;
      }

      const startedAt = performance.now();
      const step = (now: number) => {
        const progress = Math.min((now - startedAt) / durationMs, 1);
        const eased =
          progress < 0.5
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
    },
    [],
  );

  const effectiveTraveled = traveledCoords ?? (mode === 'navigation' ? polylineCoords : []);
  const effectiveRemaining = remainingRouteCoords ?? plannedRouteCoords;

  const agentLng = agentPosition?.[0] ?? null;
  const agentLat = agentPosition?.[1] ?? null;
  const destLng = destinationPosition?.[0] ?? null;
  const destLat = destinationPosition?.[1] ?? null;
  const traveledSig = useMemo(() => coordsSignature(effectiveTraveled), [effectiveTraveled]);
  const remainingSig = useMemo(() => coordsSignature(effectiveRemaining), [effectiveRemaining]);
  const savedSig = useMemo(
    () =>
      (savedLocations ?? [])
        .map(
          (p) =>
            `${p.id}:${p.name}:${p.type ?? ''}:${p.longitude.toFixed(5)},${p.latitude.toFixed(5)}:${p.color}:${p.selected ? 1 : 0}`,
        )
        .join('|'),
    [savedLocations],
  );

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
  useEffect(() => {
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
  }, [
    mode,
    effectiveTraveled,
    effectiveRemaining,
    agentPosition,
    destinationPosition,
    agentMarker,
    destinationMarkerKind,
    radiusMeters,
    arrived,
  ]);

  // fallbackView is removed

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

      const handleManualMove = () => {
        if (!isManualRef.current) {
          isManualRef.current = true;
          setIsManual(true);
        }
      };

      map.on('dragstart', handleManualMove);
      map.on('zoomstart', handleManualMove);
      map.on('pitchstart', handleManualMove);
      map.on('rotatestart', handleManualMove);

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
      if (markerAnimationRef.current !== null) {
        cancelAnimationFrame(markerAnimationRef.current);
        markerAnimationRef.current = null;
      }
      markerPositionRef.current = null;
      agentMarkerRef.current?.remove();
      agentMarkerRef.current = null;
      destMarkerRef.current?.remove();
      destMarkerRef.current = null;
      savedMarkersRef.current.forEach((marker) => marker.remove());
      savedMarkersRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Saved-location markers lifecycle (organization places).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const pins = savedLocations ?? [];
    const markers = savedMarkersRef.current;
    const nextIds = new Set(pins.map((p) => p.id));

    for (const [id, marker] of markers) {
      if (!nextIds.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    }

    for (const pin of pins) {
      const existing = markers.get(pin.id);
      if (existing) existing.remove();

      const el = createSavedLocationMarkerElement({
        name: pin.name,
        type: pin.type,
        color: pin.color,
        selected: pin.selected,
      });
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        onSavedLocationClickRef.current?.(pin.id);
      });
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([pin.longitude, pin.latitude])
        .addTo(map);
      markers.set(pin.id, marker);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- savedSig captures pins
  }, [mapReady, savedSig]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    clockInMarkerRef.current?.remove();
    clockInMarkerRef.current = null;

    if (!clockInPin) return;

    const el = createClockInMarkerElement({
      agentName: clockInPin.agentName,
      avatarUrl: clockInPin.avatarUrl,
      isLate: clockInPin.isLate,
    });
    clockInMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([clockInPin.longitude, clockInPin.latitude])
      .addTo(map);
  }, [clockInPin, mapReady]);

  // Click / long-press to drop a pin for creating a saved location.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const handleClick = (e: mapboxgl.MapMouseEvent) => {
      if (!pinModeRef.current) return;
      onMapPinRef.current?.(e.lngLat.lng, e.lngLat.lat);
    };

    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let startPoint: { x: number; y: number } | null = null;

    const clearTimer = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    const handleTouchStart = (e: mapboxgl.MapTouchEvent) => {
      if (e.points.length !== 1) {
        clearTimer();
        return;
      }
      startPoint = { x: e.point.x, y: e.point.y };
      const lngLat = e.lngLat;
      clearTimer();
      longPressTimer = setTimeout(() => {
        onMapPinRef.current?.(lngLat.lng, lngLat.lat);
      }, 600);
    };

    const handleTouchMove = (e: mapboxgl.MapTouchEvent) => {
      if (!startPoint) return;
      const dx = e.point.x - startPoint.x;
      const dy = e.point.y - startPoint.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) clearTimer();
    };

    map.on('click', handleClick);
    map.on('touchstart', handleTouchStart);
    map.on('touchmove', handleTouchMove);
    map.on('touchend', clearTimer);
    map.on('touchcancel', clearTimer);
    map.on('movestart', clearTimer);

    return () => {
      clearTimer();
      map.off('click', handleClick);
      map.off('touchstart', handleTouchStart);
      map.off('touchmove', handleTouchMove);
      map.off('touchend', clearTimer);
      map.off('touchcancel', clearTimer);
      map.off('movestart', clearTimer);
    };
  }, [mapReady]);

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

      if (!map.isStyleLoaded() && remaining.length > 1) {
        map.once('idle', () => {
          const payload = syncPayloadRef.current;
          applyRouteData(map, payload.mode, payload.effectiveTraveled, payload.effectiveRemaining);
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
      }

      if (agentPos && marker) {
        const markerInput = {
          displayName: marker.displayName,
          avatarUrl: marker.avatarUrl,
          preferInitials: marker.preferInitials,
        };

        if (agentMarkerRef.current) {
          const duration = mapMode === 'navigation' ? 400 : MARKER_ANIMATION_MS;
          animateAgentMarker(agentMarkerRef.current, agentPos, duration);
          updateAgentMarkerElement(agentMarkerRef.current.getElement(), markerInput);
        } else {
          const el = createAgentMarkerElement(markerInput);
          agentMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat(agentPos)
            .addTo(map);
          markerPositionRef.current = agentPos;
        }

        const heading = marker.headingDegrees;
        const mapBearing = map.getBearing();
        if (heading != null && Number.isFinite(heading)) {
          const relative = ((heading - mapBearing) % 360 + 360) % 360;
          agentMarkerRef.current.getElement().style.transform = `rotate(${relative}deg)`;
        } else {
          agentMarkerRef.current.getElement().style.transform = '';
        }

        const duration = mapMode === 'navigation' ? 400 : 800;
        const zoom = mapMode === 'navigation' ? NAV_ZOOM : 15;

        if (mapMode === 'navigation') {
          const rawBearing = resolveNavigationBearing(
            agentPos,
            remaining,
            destPos,
            marker.headingDegrees,
            marker.speedMps,
          );
          const targetBearing =
            rawBearing != null
              ? smoothBearingDegrees(mapBearingRef.current, rawBearing)
              : mapBearingRef.current;

          if (!isManualRef.current) {
            if (!enteredNavigationRef.current) {
              enteredNavigationRef.current = true;
              mapBearingRef.current = targetBearing;
              map.easeTo({
                center: agentPos,
                zoom: NAV_ZOOM,
                bearing: targetBearing,
                pitch: NAV_PITCH,
                padding: NAV_CAMERA_PADDING,
                duration: 900,
              });
            } else {
              mapBearingRef.current = targetBearing;
              map.easeTo({
                center: agentPos,
                zoom: NAV_ZOOM,
                bearing: targetBearing,
                pitch: NAV_PITCH,
                padding: NAV_CAMERA_PADDING,
                duration,
              });
            }
          }
        } else if (remaining.length <= 1) {
          if (!isManualRef.current) {
            map.easeTo({ center: agentPos, zoom, duration });
          }
        }
      } else if (agentMarkerRef.current) {
        if (markerAnimationRef.current !== null) {
          cancelAnimationFrame(markerAnimationRef.current);
          markerAnimationRef.current = null;
        }
        agentMarkerRef.current.remove();
        agentMarkerRef.current = null;
        markerPositionRef.current = null;
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
    agentMarker?.speedMps,
    destinationMarkerKind,
    radiusMeters,
    arrived,
    animateAgentMarker,
  ]);

  useEffect(() => {
    previewFitDoneRef.current = false;
  }, [remainingSig, destLng, destLat]);

  useEffect(() => {
    pinModeRef.current = pinMode;
    onMapPinRef.current = onMapPin;
    onSavedLocationClickRef.current = onSavedLocationClick;
  });

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const canvas = map.getCanvas();
    canvas.style.cursor = pinMode ? 'crosshair' : '';
  }, [mapReady, pinMode]);

  useEffect(() => {
    if (mode === 'navigation') {
      wasNavigationRef.current = true;
      return;
    }

    if (wasNavigationRef.current) {
      wasNavigationRef.current = false;
      enteredNavigationRef.current = false;
      mapBearingRef.current = 0;
      const map = mapRef.current;
      if (map) {
        map.easeTo({ bearing: 0, pitch: 0, duration: 600 });
      }
    } else {
      enteredNavigationRef.current = false;
    }
  }, [mode]);

  if (mapError) {
    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center bg-[#0A1D25] text-white px-6 font-sans">
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
        
        {/* Soft radial glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(29,114,147,0.15)_0%,transparent_70%)] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center max-w-sm text-center">
          {/* Animated/Glowing Icon Container */}
          <div className="relative mb-5 flex items-center justify-center">
            {/* Outer pulse */}
            <div className="absolute inset-0 rounded-full bg-[#FD6046]/10 animate-pulse w-20 h-20" />
            {/* Inner glow */}
            <div className="absolute -inset-2 rounded-full bg-gradient-to-tr from-[#FD6046] to-[#1D7293] opacity-35 blur-md" />
            {/* Main icon container */}
            <div className="relative w-16 h-16 rounded-2xl bg-[#09232D] border border-white/10 flex items-center justify-center shadow-2xl">
              <MapIcon className="w-8 h-8 text-[#FD6046]" />
              <AlertCircle className="w-4 h-4 text-[#FD6046] absolute bottom-2 right-2 bg-[#09232D] rounded-full" />
            </div>
          </div>

          <h3 className="text-base font-bold text-white mb-2 tracking-tight">
            Map Loading Issue
          </h3>
          <p className="text-xs text-gray-400 mb-5 leading-relaxed max-w-[280px]">
            There was an issue loading the maps. Please check your network connection and try again.
          </p>

          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-[#1D7293] to-[#09232D] hover:opacity-90 active:scale-95 transition-all text-xs font-bold text-white shadow-lg border border-white/10 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reload Map</span>
          </button>
        </div>
        {dimmed && <div className="absolute inset-0 bg-black/45 pointer-events-none" />}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full agent-mapbox-surface">
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />
      {dimmed && <div className="absolute inset-0 bg-black/45 pointer-events-none" />}
      {isManual && (
        <button
          onClick={() => {
            isManualRef.current = false;
            setIsManual(false);
            const map = mapRef.current;
            const agentPos = syncPayloadRef.current.agentPosition;
            if (map && agentPos) {
              if (syncPayloadRef.current.mode === 'navigation') {
                const bearing = syncPayloadRef.current.agentMarker?.headingDegrees ?? map.getBearing();
                map.easeTo({
                  center: agentPos,
                  zoom: NAV_ZOOM,
                  bearing,
                  pitch: NAV_PITCH,
                  padding: NAV_CAMERA_PADDING,
                  duration: 800,
                });
              } else {
                map.easeTo({
                  center: agentPos,
                  zoom: 15,
                  duration: 800,
                });
              }
            }
          }}
          className="absolute right-4 bottom-[240px] z-20 w-11 h-11 rounded-full bg-white shadow-lg border border-gray-100 flex items-center justify-center active:scale-95 transition-all text-[#1D7293]"
          aria-label="Recenter map"
          title="Recenter"
        >
          <Navigation size={20} className="transform rotate-45 text-[#1D7293]" />
        </button>
      )}
    </div>
  );
}

export default React.memo(MapboxMap);
