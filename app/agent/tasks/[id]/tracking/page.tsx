'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { ArrowLeft, Navigation, CheckCircle, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth';
import { getActiveCompanyContext } from '@/lib/company-context';
import { getAuthTokenFromDocument } from '@/lib/auth/session';
import {
  createMapboxTransformRequest,
  getGoogleMapsPublicApiKey,
  getMapboxPublicToken,
} from '@/lib/config/public-env';
import { useTaskDetail } from '@/hooks/use-tasks';
import { useTrackingWebSocket } from '@/hooks/use-tracking-ws';
import { useActiveTracking } from '@/components/tracking/active-tracking-provider';
import { startTaskTracking } from '@/lib/api/tracking';
import { ApiRequestError } from '@/lib/api/onboarding';
import { LocationPermissionGate } from '@/components/tracking/LocationPermissionGate';
import { CompleteTaskSheet } from '@/components/tracking/CompleteTaskSheet';
import { useTrackingStore } from '@/store/tracking';
import type { GeoReading } from '@/types/tracking';
import {
  getCountryFallbackViewport,
  resolvePrivacySafeViewport,
} from '@/lib/map/default-viewport';
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
import { useEffectiveMapProvider, type EffectiveMapProviderState } from '@/hooks/use-effective-map-provider';
import { loadGoogleMapsApi } from '@/lib/map/google-loader';

type Phase = 'permission' | 'ready' | 'tracking' | 'complete';

type TrackingMapProps = {
  agentPosition: [number, number] | null;
  destination: { lat: number; lng: number } | null;
  trail: [number, number][];
  agentName: string;
  agentAvatarUrl?: string;
  status: 'in_progress' | 'near_destination' | 'arrived' | 'completed';
};

type GoogleLatLng = { lat: number; lng: number };

type GoogleMapLike = {
  setCenter: (point: GoogleLatLng) => void;
  setZoom: (zoom: number) => void;
  panTo: (point: GoogleLatLng) => void;
};

type GooglePolylineLike = {
  setMap: (map: GoogleMapLike | null) => void;
  setPath: (path: GoogleLatLng[]) => void;
  setOptions: (options: Record<string, unknown>) => void;
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
    SymbolPath: {
      CIRCLE: unknown;
    };
  };
};

function MapboxTrackingMap({
  agentPosition,
  destination,
  trail,
  agentName,
  agentAvatarUrl,
  status,
  providerState,
}: TrackingMapProps & { providerState: EffectiveMapProviderState }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapLoadedRef = useRef(false);
  const agentMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const originMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const destinationMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const markerAnimationRef = useRef<number | null>(null);
  const markerPositionRef = useRef<[number, number] | null>(null);
  const mapboxToken = useMemo(() => getMapboxPublicToken(), []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !mapboxToken) return;
    mapboxgl.accessToken = mapboxToken;
    const fallbackViewport = getCountryFallbackViewport();

    const center: [number, number] = agentPosition
      ? agentPosition
      : destination
        ? [destination.lng, destination.lat]
        : fallbackViewport.center;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center,
      zoom: agentPosition || destination ? 15 : fallbackViewport.zoom,
      interactive: true,
      transformRequest: createMapboxTransformRequest(),
    });
    mapRef.current = map;

    map.on('load', () => {
      map.addSource('tracking-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'tracking-route-casing',
        type: 'line',
        source: 'tracking-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#FFFFFF',
          'line-width': 8,
          'line-opacity': 0.75,
        },
      });
      map.addLayer({
        id: 'tracking-route-line',
        type: 'line',
        source: 'tracking-route',
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

      map.addSource('tracking-route-connector', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'tracking-route-connector-line',
        type: 'line',
        source: 'tracking-route-connector',
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

      map.addSource('tracking-route-direction', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'tracking-route-direction-line',
        type: 'line',
        source: 'tracking-route-direction',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#075985',
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
      originMarkerRef.current?.remove();
      destinationMarkerRef.current?.remove();
      agentMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
      markerPositionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current || agentPosition || destination) return;

    let cancelled = false;

    resolvePrivacySafeViewport().then((viewport) => {
      if (cancelled || !mapRef.current || agentPosition || destination) {
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
  }, [agentPosition, destination]);

  // Update agent marker on new position
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    const routeSource = map.getSource('tracking-route') as mapboxgl.GeoJSONSource | undefined;
    const connectorSource = map.getSource('tracking-route-connector') as mapboxgl.GeoJSONSource | undefined;
    const directionSource = map.getSource('tracking-route-direction') as mapboxgl.GeoJSONSource | undefined;

    const path = sanitizePolyline(trail);
    const visualState = resolveVisualTaskState(status, false);

    routeSource?.setData({
      type: 'FeatureCollection',
      features: path.length >= 2
        ? [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: path,
            },
            properties: { status: visualState },
          },
        ]
        : [],
    });

    const directionSegment = buildDirectionSegment(path);
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

    const originPoint = path[0] ?? agentPosition;
    if (originPoint) {
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
    }

    if (destination) {
      const destinationLngLat: [number, number] = [destination.lng, destination.lat];
      const markerKind =
        status === 'completed'
          ? 'completed'
          : status === 'near_destination'
            ? 'near'
            : status === 'arrived'
              ? 'arrived'
              : 'destination';

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

      if (agentPosition && !areSamePoint(agentPosition, destinationLngLat)) {
        connectorSource?.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: [agentPosition, destinationLngLat],
              },
              properties: { status: visualState },
            },
          ],
        });
      } else {
        connectorSource?.setData({ type: 'FeatureCollection', features: [] });
      }
    } else {
      connectorSource?.setData({ type: 'FeatureCollection', features: [] });
      destinationMarkerRef.current?.remove();
      destinationMarkerRef.current = null;
    }

    if (!agentPosition) return;

    if (!agentMarkerRef.current) {
      const el = createAgentMarkerElement({
        name: agentName,
        avatarUrl: agentAvatarUrl,
        visualState,
        stale: false,
      });
      agentMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat(agentPosition)
        .addTo(map);
      markerPositionRef.current = agentPosition;
    } else {
      updateAgentMarkerElement(agentMarkerRef.current.getElement(), {
        name: agentName,
        avatarUrl: agentAvatarUrl,
        visualState,
        stale: false,
      });

      const from = markerPositionRef.current ?? [agentMarkerRef.current.getLngLat().lng, agentMarkerRef.current.getLngLat().lat] as [number, number];
      if (!areSamePoint(from, agentPosition)) {
        if (markerAnimationRef.current) {
          cancelAnimationFrame(markerAnimationRef.current);
          markerAnimationRef.current = null;
        }

        const startedAt = performance.now();
        const duration = 700;
        const step = (now: number) => {
          const progress = Math.min((now - startedAt) / duration, 1);
          const eased = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
          const nextLng = from[0] + (agentPosition[0] - from[0]) * eased;
          const nextLat = from[1] + (agentPosition[1] - from[1]) * eased;
          agentMarkerRef.current?.setLngLat([nextLng, nextLat]);

          if (progress < 1) {
            markerAnimationRef.current = requestAnimationFrame(step);
            return;
          }

          markerAnimationRef.current = null;
          markerPositionRef.current = agentPosition;
        };

        markerAnimationRef.current = requestAnimationFrame(step);
      }
    }

    map.easeTo({ center: agentPosition, duration: 700 });
  }, [agentPosition, destination, trail, agentName, agentAvatarUrl, status]);

  if (!mapboxToken) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#eef0f3] text-[12px] font-medium text-gray-500 px-4 text-center">
        Tracking map requires NEXT_PUBLIC_MAPBOX_TOKEN.
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />

      {providerState.fallbackReason === 'missing_google_api_key' && providerState.requestedProvider === 'google' && (
        <div className="absolute bottom-3 left-3 right-3 rounded-md bg-black/75 px-3 py-2 text-[11px] font-medium text-white">
          Google map is selected by admin, but NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing. Showing Mapbox fallback.
        </div>
      )}
    </div>
  );
}

function GoogleTrackingMap({
  agentPosition,
  destination,
  trail,
  agentName,
  status,
  providerState,
}: TrackingMapProps & { providerState: EffectiveMapProviderState }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const googleRef = useRef<GoogleMapsNamespaceLike | null>(null);
  const mapRef = useRef<GoogleMapLike | null>(null);
  const routeLineRef = useRef<GooglePolylineLike | null>(null);
  const connectorLineRef = useRef<GooglePolylineLike | null>(null);
  const directionLineRef = useRef<GooglePolylineLike | null>(null);
  const agentMarkerRef = useRef<GoogleMarkerLike | null>(null);
  const originMarkerRef = useRef<GoogleMarkerLike | null>(null);
  const destinationMarkerRef = useRef<GoogleMarkerLike | null>(null);
  const googleApiKey = useMemo(() => getGoogleMapsPublicApiKey(), []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !googleApiKey) return;

    let cancelled = false;

    loadGoogleMapsApi(googleApiKey)
      .then((google) => {
        const googleMaps = google as GoogleMapsNamespaceLike;

        if (cancelled || !containerRef.current) return;

        googleRef.current = googleMaps;
        const fallbackViewport = getCountryFallbackViewport();
        const center = agentPosition
          ? { lat: agentPosition[1], lng: agentPosition[0] }
          : destination
            ? { lat: destination.lat, lng: destination.lng }
            : { lat: fallbackViewport.center[1], lng: fallbackViewport.center[0] };

        mapRef.current = new googleMaps.maps.Map(containerRef.current, {
          center,
          zoom: agentPosition || destination ? 15 : fallbackViewport.zoom,
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
      routeLineRef.current?.setMap(null);
      connectorLineRef.current?.setMap(null);
      directionLineRef.current?.setMap(null);
      agentMarkerRef.current?.setMap(null);
      originMarkerRef.current?.setMap(null);
      destinationMarkerRef.current?.setMap(null);

      routeLineRef.current = null;
      connectorLineRef.current = null;
      directionLineRef.current = null;
      agentMarkerRef.current = null;
      originMarkerRef.current = null;
      destinationMarkerRef.current = null;
      mapRef.current = null;
      googleRef.current = null;
    };
  }, [agentPosition, destination, googleApiKey]);

  useEffect(() => {
    const map = mapRef.current;
    const google = googleRef.current;
    if (!map || !google) return;

    const path = sanitizePolyline(trail);
    const visualState = resolveVisualTaskState(status, false);

    if (!routeLineRef.current) {
      routeLineRef.current = new google.maps.Polyline({
        map,
        geodesic: true,
        strokeColor: VISUAL_PALETTE[visualState].trail,
        strokeOpacity: 0.95,
        strokeWeight: 4,
      });
    }
    routeLineRef.current.setOptions({ strokeColor: VISUAL_PALETTE[visualState].trail });
    routeLineRef.current.setPath(path.map((point: [number, number]) => ({ lat: point[1], lng: point[0] })));

    const directionSegment = buildDirectionSegment(path);
    if (directionSegment) {
      if (!directionLineRef.current) {
        directionLineRef.current = new google.maps.Polyline({
          map,
          geodesic: true,
          strokeColor: '#075985',
          strokeOpacity: 0.95,
          strokeWeight: 5,
        });
      }
      directionLineRef.current.setPath(directionSegment.map((point: [number, number]) => ({ lat: point[1], lng: point[0] })));
    } else if (directionLineRef.current) {
      directionLineRef.current.setMap(null);
      directionLineRef.current = null;
    }

    const originPoint = path[0] ?? agentPosition;
    if (originPoint) {
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
    }

    if (destination) {
      const destinationColor =
        status === 'completed'
          ? '#334155'
          : status === 'arrived'
            ? '#16A34A'
            : status === 'near_destination'
              ? '#D97706'
              : '#DC2626';

      if (!destinationMarkerRef.current) {
        destinationMarkerRef.current = new google.maps.Marker({
          map,
          position: { lat: destination.lat, lng: destination.lng },
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
        destinationMarkerRef.current.setPosition({ lat: destination.lat, lng: destination.lng });
        destinationMarkerRef.current.setIcon({
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: destinationColor,
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 3,
        });
      }

      if (agentPosition && !areSamePoint(agentPosition, [destination.lng, destination.lat])) {
        if (!connectorLineRef.current) {
          connectorLineRef.current = new google.maps.Polyline({
            map,
            geodesic: true,
            strokeColor: VISUAL_PALETTE[visualState].connector,
            strokeOpacity: 0.85,
            strokeWeight: 3,
            icons: [{
              icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
              offset: '0',
              repeat: '10px',
            }],
          });
        }

        connectorLineRef.current.setPath([
          { lat: agentPosition[1], lng: agentPosition[0] },
          { lat: destination.lat, lng: destination.lng },
        ]);
      } else if (connectorLineRef.current) {
        connectorLineRef.current.setMap(null);
        connectorLineRef.current = null;
      }
    } else {
      destinationMarkerRef.current?.setMap(null);
      destinationMarkerRef.current = null;
      connectorLineRef.current?.setMap(null);
      connectorLineRef.current = null;
    }

    if (!agentPosition) {
      return;
    }

    if (!agentMarkerRef.current) {
      agentMarkerRef.current = new google.maps.Marker({
        map,
        position: { lat: agentPosition[1], lng: agentPosition[0] },
        title: agentName,
        label: {
          text: (agentName || 'A').slice(0, 1).toUpperCase(),
          color: '#FFFFFF',
          fontWeight: '700',
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: '#0F172A',
          fillOpacity: 0.92,
          strokeColor: '#FFFFFF',
          strokeWeight: 2,
        },
      });
    } else {
      agentMarkerRef.current.setPosition({ lat: agentPosition[1], lng: agentPosition[0] });
    }

    map.panTo({ lat: agentPosition[1], lng: agentPosition[0] });
  }, [agentName, agentPosition, destination, status, trail]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || agentPosition || destination) return;

    let cancelled = false;

    resolvePrivacySafeViewport().then((viewport) => {
      if (cancelled || !mapRef.current || agentPosition || destination) {
        return;
      }

      mapRef.current.setCenter({ lat: viewport.center[1], lng: viewport.center[0] });
      mapRef.current.setZoom(viewport.zoom);
    });

    return () => {
      cancelled = true;
    };
  }, [agentPosition, destination]);

  if (!googleApiKey) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#eef0f3] text-[12px] font-medium text-gray-500 px-4 text-center">
        Tracking map requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />

      {providerState.fallbackReason === 'missing_mapbox_token' && providerState.requestedProvider === 'mapbox' && (
        <div className="absolute bottom-3 left-3 right-3 rounded-md bg-black/75 px-3 py-2 text-[11px] font-medium text-white">
          Mapbox is selected by admin, but NEXT_PUBLIC_MAPBOX_TOKEN is missing. Showing Google fallback.
        </div>
      )}
    </div>
  );
}

function TrackingMap(props: TrackingMapProps) {
  const providerState = useEffectiveMapProvider();

  if (providerState.effectiveProvider === 'google') {
    return <GoogleTrackingMap {...props} providerState={providerState} />;
  }

  return <MapboxTrackingMap {...props} providerState={providerState} />;
}

export default function TrackingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const taskId = Number(id);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);
  const { data: task } = useTaskDetail(taskId, companyId ?? undefined);
  const { startTracking, stopTracking, activeTaskId } = useActiveTracking();
  const liveTask = useTrackingStore((s) => s.liveTasks[taskId]);

  useTrackingWebSocket();

  const [phase, setPhase] = useState<Phase>(() =>
    // If already tracking this task, skip straight to tracking phase
    typeof window !== 'undefined' && activeTaskId === taskId ? 'tracking' : 'permission'
  );
  const [initialReading, setInitialReading] = useState<GeoReading | null>(null);
  const [agentPosition, setAgentPosition] = useState<[number, number] | null>(null);
  const [arrived, setArrived] = useState(false);
  const [showCompleteSheet, setShowCompleteSheet] = useState(false);
  const [commencing, setCommencing] = useState(false);

  useEffect(() => {
    if (!liveTask) return;

    queueMicrotask(() => {
      setAgentPosition(liveTask.lastPosition);

      if (liveTask.status === 'arrived') {
        setArrived(true);
      }
    });
  }, [liveTask]);

  const destination =
    task?.latitude && task?.longitude
      ? { lat: task.latitude, lng: task.longitude }
      : null;

  const trackingTrail = liveTask ? buildTaskTrail(liveTask) : agentPosition ? [agentPosition] : [];

  const handleLocationGranted = async (reading: GeoReading) => {
    setInitialReading(reading);
    setAgentPosition([reading.longitude, reading.latitude]);
    setPhase('ready');
  };

  const handleBeginTask = async () => {
    if (!companyId || !initialReading) return;
    const signedInUserId = user?.id;
    if (typeof signedInUserId !== 'number') {
      toast.error('Your session is unavailable. Please sign in again.');
      return;
    }

    setCommencing(true);
    try {
      const token = getAuthTokenFromDocument();
      const res = await startTaskTracking(
        taskId,
        {
          company_id: companyId,
          location_permission_granted: true,
          latitude: initialReading.latitude,
          longitude: initialReading.longitude,
          accuracy_meters: initialReading.accuracyMeters,
          recorded_at: initialReading.recordedAt,
        },
        token
      );

      useTrackingStore.getState().seedFromTaskStart({
        taskId,
        trackingSessionId: res.data.tracking.id,
        userId: signedInUserId,
        agentName: user?.name,
        agentAvatarUrl: user?.avatar ?? undefined,
        taskTitle: res.data.task.title,
        taskAddress: res.data.task.address ?? res.data.task.location ?? undefined,
        destination:
          typeof res.data.task.latitude === 'number' &&
            typeof res.data.task.longitude === 'number'
            ? {
              lat: res.data.task.latitude,
              lng: res.data.task.longitude,
              radiusM: res.data.tracking.destination?.radius_meters ?? 75,
            }
            : undefined,
        position: [initialReading.longitude, initialReading.latitude],
        occurredAt: initialReading.recordedAt,
      });

      startTracking(taskId, companyId as number, token, {
        onArrived: () => {
          setArrived(true);
          toast.success("You've arrived at the destination!");
        },
        onError: () => { },
      });

      if (res.data.arrived) {
        setArrived(true);
        toast.success("You're already at the destination!");
      }

      setPhase('tracking');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const first = err.errors ? Object.values(err.errors)[0]?.[0] : null;
        toast.error(first ?? err.message ?? 'Failed to start tracking.');
      } else {
        toast.error('Failed to start task.');
      }
    } finally {
      setCommencing(false);
    }
  };

  const handleCompleteSuccess = () => {
    stopTracking();
    setShowCompleteSheet(false);
    router.push('/agent/tasks');
  };

  return (
    <div className="h-screen flex flex-col bg-[#f8f9fb] overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 flex items-center gap-3 shrink-0 z-10">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center"
        >
          <ArrowLeft size={18} className="text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-dash-dark truncate">
            {task?.title ?? `Task #${taskId}`}
          </p>
          {phase === 'tracking' && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <p className="text-[11px] text-gray-400">Tracking active</p>
            </div>
          )}
        </div>
      </div>

      {/* Phase A — Permission */}
      {phase === 'permission' && (
        <div className="flex-1 overflow-y-auto flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <LocationPermissionGate
              onGranted={handleLocationGranted}
              onDenied={() => router.back()}
              onCancel={() => router.back()}
            />
          </div>
        </div>
      )}

      {/* Phase B — Ready to start */}
      {phase === 'ready' && initialReading && (
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-6 gap-6">
          <div className="w-16 h-16 rounded-full bg-dash-teal/10 flex items-center justify-center">
            <Navigation size={28} className="text-dash-teal" />
          </div>
          <div className="text-center">
            <h2 className="text-[18px] font-bold text-dash-dark mb-1">Ready to go</h2>
            <p className="text-[13px] text-gray-500">
              GPS lock confirmed (±{Math.round(initialReading.accuracyMeters ?? 0)}m)
            </p>
            {destination && (
              <div className="flex items-center justify-center gap-1.5 mt-2 text-[12px] text-gray-400">
                <MapPin size={12} />
                {task?.address ?? task?.location ?? 'Destination set'}
              </div>
            )}
          </div>
          <button
            onClick={handleBeginTask}
            disabled={commencing}
            className="w-full max-w-xs py-4 bg-[#7EB5AE] text-white rounded-2xl text-[15px] font-bold shadow-lg shadow-[#7EB5AE]/20 hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {commencing ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Navigation size={16} />
            )}
            {commencing ? 'Starting…' : 'Begin Task'}
          </button>
        </div>
      )}

      {/* Phase C — Active tracking */}
      {phase === 'tracking' && (
        <>
          {/* Map fills remaining space */}
          <div className="flex-1 relative">
            <TrackingMap
              agentPosition={agentPosition}
              destination={destination}
              trail={trackingTrail}
              agentName={liveTask?.agentName ?? user?.name ?? 'Agent'}
              agentAvatarUrl={liveTask?.agentAvatarUrl ?? user?.avatar ?? undefined}
              status={liveTask?.status ?? 'in_progress'}
            />

            {/* GPS accuracy badge */}
            {initialReading?.accuracyMeters && (
              <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-1.5 shadow text-[11px] text-gray-600 font-semibold">
                ±{Math.round(initialReading.accuracyMeters)}m accuracy
              </div>
            )}

            {/* Arrived banner */}
            {arrived && (
              <div className="absolute top-3 left-3 right-14 bg-green-500 text-white rounded-xl px-4 py-2.5 shadow-lg flex items-center gap-2">
                <CheckCircle size={16} />
                <span className="text-[13px] font-bold">Arrived at destination!</span>
              </div>
            )}
          </div>

          {/* Bottom action bar */}
          <div className="bg-white border-t border-gray-100 px-5 py-4 pb-safe shrink-0">
            <button
              onClick={() => setShowCompleteSheet(true)}
              className={`w-full py-4 rounded-2xl text-[14px] font-bold flex items-center justify-center gap-2 transition-all ${arrived
                ? 'bg-[#7EB5AE] text-white shadow-lg shadow-[#7EB5AE]/20 hover:opacity-90'
                : 'bg-gray-100 text-gray-400'
                }`}
            >
              <CheckCircle size={16} />
              Complete Task
            </button>
            {!arrived && (
              <p className="text-center text-[11px] text-gray-400 mt-2">
                Complete task button activates when you arrive at the destination.
              </p>
            )}
          </div>
        </>
      )}

      {/* Complete sheet overlay */}
      {showCompleteSheet && companyId && (
        <CompleteTaskSheet
          taskId={taskId}
          companyId={companyId}
          minimumPhotos={task?.minimum_photos_required ?? 1}
          onSuccess={handleCompleteSuccess}
          onClose={() => setShowCompleteSheet(false)}
        />
      )}
    </div>
  );
}
