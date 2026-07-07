'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { Search, Eye, EyeOff, Radio, RefreshCcw, MoreHorizontal, LocateFixed } from 'lucide-react';
import {
  getGoogleMapsPublicApiKey,
  MAPBOX_PUBLIC_TOKEN_ENV,
  createMapboxTransformRequest,
  getMapboxPublicToken,
} from '@/lib/config/public-env';
import { useEffectiveMapProvider, type EffectiveMapProviderState } from '@/hooks/use-effective-map-provider';
import { loadGoogleMapsApi } from '@/lib/map/google-loader';
import { useTrackingStore } from '@/store/tracking';
import { useTrackingWebSocket } from '@/hooks/use-tracking-ws';
import { RouteHistoryPanel } from '@/components/map/RouteHistoryPanel';
import type { LiveTaskState } from '@/types/tracking';
import {
  areSamePoint,
  buildTaskTrail,
  createAgentMarkerElement,
  createPulseMarkerElement,
  createStaticMarkerElement,
  getAgentInitials,
  resolveVisualTaskState,
  sanitizePolyline,
  updateAgentMarkerElement,
  VISUAL_PALETTE,
  type VisualTaskState,
} from '@/lib/tracking/map-visualization';
import { fetchDirectionsRoute, clearDirectionsCache } from '@/lib/tracking/directions';
import {
  getMapboxNavigationStyle,
  resolveMapAppearance,
  type MapAppearance,
} from '@/lib/map/style-mode';
import {
  OPERATIONAL_STATUS_META,
  resolveOperationalStatusFromTask,
} from '@/lib/tracking/operational-status';
import {
  getCountryFallbackViewport,
  resolvePrivacySafeViewport,
} from '@/lib/map/default-viewport';
import { SavedLocationsLayer, type GoogleMapBridge } from '@/components/map/SavedLocationsLayer';
import { TerritoryLayer } from '@/components/map/TerritoryLayer';
import { useSavedLocations, useSavedLocationPermissions } from '@/hooks/use-saved-locations';
import { getSavedLocationLabel } from '@/lib/map/location-types';
import type { SavedLocation } from '@/lib/api/saved-locations';
import { LocationSearchInput } from '@/components/map/LocationSearchInput';
import { BusinessListPanel } from '@/components/map/BusinessListPanel';
import { isInsideLocationContext, type LocationContext } from '@/lib/map/location-search';
import {
  fetchBusinessesInBbox,
  fetchBusinessesNearPoint,
  isBboxTooLarge,
  type PoiResult,
} from '@/lib/map/overpass-search';

const STALE_MS = 2 * 60_000;
const MARKER_ANIMATION_MS = 700;
const SEARCH_DEBOUNCE_MS = 280;

// ── POI pin helpers (module-level, no component deps) ────────────────────────

function buildPinSvg(color: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38">` +
    `<path d="M14 2C7.37 2 2 7.37 2 14c0 9.04 12 22 12 22S26 23.04 26 14C26 7.37 20.63 2 14 2z" ` +
    `fill="${color}" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<circle cx="14" cy="14" r="5.5" fill="white" opacity="0.92"/>` +
    `</svg>`
  );
}

function loadPinImage(map: mapboxgl.Map, color: string): Promise<void> {
  const id = `poi-pin-${color.replace('#', '')}`;
  if (map.hasImage(id)) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image(28, 38);
    img.onload = () => { if (!map.hasImage(id)) map.addImage(id, img); resolve(); };
    img.onerror = () => resolve();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildPinSvg(color))}`;
  });
}

type GoogleLatLng = { lat: number; lng: number };

type GoogleLatLngBoundsLike = {
  extend: (point: GoogleLatLng) => void;
};

type GoogleMapLike = {
  setCenter: (point: GoogleLatLng) => void;
  setZoom: (zoom: number) => void;
  panTo: (point: GoogleLatLng) => void;
  getZoom: () => number;
  fitBounds: (bounds: GoogleLatLngBoundsLike, padding?: number) => void;
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
  setLabel: (label: Record<string, unknown>) => void;
  addListener: (event: string, handler: () => void) => void;
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

function isTaskStale(lastEventAt: string, nowMs: number): boolean {
  if (!lastEventAt || !nowMs) return false;
  return nowMs - new Date(lastEventAt).getTime() > STALE_MS;
}

function getStatusLabel(status: LiveTaskState['status']): string {
  if (status === 'near_destination') return 'Near destination';
  if (status === 'arrived') return 'Arrived';
  if (status === 'completed') return 'Completed';
  return 'On field';
}

function formatMetricDistance(meters: number | null | undefined): string {
  if (meters == null || Number.isNaN(meters)) return '--';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatSpeed(speedMps: number | null | undefined): string {
  if (speedMps == null || Number.isNaN(speedMps)) return '--';
  return `${(speedMps * 3.6).toFixed(1)} km/h`;
}

function formatEta(etaSeconds: number | null | undefined): string {
  if (etaSeconds == null || etaSeconds < 0) return '--';
  if (etaSeconds < 60) return '<1 min';
  const minutes = Math.round(etaSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildAgentPopupHtml(params: { name: string; avatarUrl?: string; location: string; statusLabel: string }): string {
  const name = escapeHtml(params.name || 'Agent');
  const location = escapeHtml(params.location || 'No location details');
  const statusLabel = escapeHtml(params.statusLabel || 'On field');
  const initials = escapeHtml(getAgentInitials(params.name) ?? '');
  const avatarUrl = params.avatarUrl ? escapeHtml(params.avatarUrl) : '';

  return `
    <div style="display:flex; align-items:center; gap:12px; min-width:240px; max-width:320px; padding:12px 14px; border-radius:18px; background:rgba(255,255,255,0.96); border:1px solid rgba(148,163,184,0.18); box-shadow:0 18px 48px rgba(15,23,42,0.16); backdrop-filter:blur(18px);">
      <div style="width:52px; height:52px; border-radius:9999px; overflow:hidden; background:#E2E8F0; flex:0 0 auto; display:flex; align-items:center; justify-content:center;">
        ${avatarUrl ? `<img src="${avatarUrl}" alt="${name} avatar" style="width:100%; height:100%; object-fit:cover; display:block;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
        <div style="width:100%; height:100%; display:${avatarUrl ? 'none' : 'flex'}; align-items:center; justify-content:center; font-size:14px; font-weight:800; color:#0F172A; background:linear-gradient(135deg, #E2E8F0, #F8FAFC);">${initials || '•'}</div>
      </div>
      <div style="min-width:0; flex:1; font-family:ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
        <div style="font-size:14px; font-weight:700; color:#0F172A; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
        <div style="margin-top:4px; font-size:12px; line-height:1.45; color:#475569; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${location}</div>
        <div style="margin-top:6px; font-size:11px; font-weight:700; letter-spacing:0.02em; text-transform:uppercase; color:#0EA5E9;">${statusLabel}</div>
      </div>
    </div>
  `;
}

function buildDestinationPopupHtml(params: { title: string; location: string; statusLabel: string }): string {
  const title = escapeHtml(params.title || 'Destination');
  const location = escapeHtml(params.location || 'No location details');
  const statusLabel = escapeHtml(params.statusLabel || 'Destination');

  return `
    <div style="min-width:220px; max-width:300px; padding:12px 14px; border-radius:18px; background:rgba(255,255,255,0.96); border:1px solid rgba(148,163,184,0.18); box-shadow:0 18px 48px rgba(15,23,42,0.16); backdrop-filter:blur(18px); font-family:ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <div style="font-size:14px; font-weight:700; color:#0F172A; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${title}</div>
      <div style="margin-top:5px; font-size:12px; line-height:1.45; color:#475569; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${location}</div>
      <div style="margin-top:6px; font-size:11px; font-weight:700; letter-spacing:0.02em; text-transform:uppercase; color:#DC2626;">${statusLabel}</div>
    </div>
  `;
}

function getDestinationMarkerKind(status: LiveTaskState['status']): 'destination' | 'near' | 'arrived' | 'completed' {
  if (status === 'completed') return 'completed';
  if (status === 'near_destination') return 'near';
  if (status === 'arrived') return 'arrived';
  return 'destination';
}

function getVisualState(task: LiveTaskState, stale: boolean): VisualTaskState {
  return resolveVisualTaskState(task.status, stale, task.operationalStatus);
}

function createUserLocationIndicatorElement() {
  const root = document.createElement('div');
  root.style.position = 'relative';
  root.style.width = '18px';
  root.style.height = '18px';
  root.style.borderRadius = '9999px';
  root.style.display = 'flex';
  root.style.alignItems = 'center';
  root.style.justifyContent = 'center';
  root.style.pointerEvents = 'none';

  root.innerHTML = `
    <div style="position:absolute; width:40px; height:40px; border-radius:9999px; background:rgba(37,99,235,0.2); animation:dashboard-user-pulse 1.8s ease-out infinite;"></div>
    <div style="position:absolute; width:24px; height:24px; border-radius:9999px; background:rgba(59,130,246,0.35);"></div>
    <div style="position:relative; width:18px; height:18px; border-radius:9999px; background:#2563EB; border:3px solid #FFFFFF; box-shadow:0 4px 14px rgba(37,99,235,0.4);"></div>
    <style>
      @keyframes dashboard-user-pulse {
        0% { transform: scale(0.7); opacity: .8; }
        100% { transform: scale(1.35); opacity: 0; }
      }
    </style>
  `;

  return root;
}

interface MapViewProps {
  compact?: boolean;
}

function hasUsableTaskPosition(task: LiveTaskState): boolean {
  return task.lastPosition[0] !== 0 || task.lastPosition[1] !== 0;
}

export function MapboxMapView({ compact = false, providerState }: MapViewProps & { providerState: EffectiveMapProviderState }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapLoadedRef = useRef(false);
  const originMarkersRef = useRef<Map<number, mapboxgl.Marker>>(new Map());
  const destinationMarkersRef = useRef<Map<number, mapboxgl.Marker>>(new Map());
  const agentMarkersRef = useRef<Map<number, mapboxgl.Marker>>(new Map());
  const markerAnimationsRef = useRef<Map<number, number>>(new Map());
  const markerPositionRef = useRef<Map<number, [number, number]>>(new Map());
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const pulseMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const userLocationMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const locateMePinRef = useRef<mapboxgl.Marker | null>(null);
  const directionRoutesRef = useRef<Map<number, [number, number][]>>(new Map());

  const [searchQuery, setSearchQuery] = useState('');
  const [appearance, setAppearance] = useState<MapAppearance>(() => resolveMapAppearance());
  const [placeResults, setPlaceResults] = useState<Array<{ id: string; name: string; center: [number, number]; bbox: [number, number, number, number] | null }>>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [historyTask, setHistoryTask] = useState<{ id: number; title: string } | null>(null);
  // Bumped every 30s to re-evaluate stale status and sync markers
  const [tick, setTick] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Flips true after map 'load' fires so the sync effect knows the map is ready
  const [mapVersion, setMapVersion] = useState(0);
  const [isInitialHydrating, setIsInitialHydrating] = useState(false);
  const hoverPopupRef = useRef<mapboxgl.Popup | null>(null);
  const [pinMode, setPinMode] = useState(false);
  const [focusLocation, setFocusLocation] = useState<SavedLocation | null>(null);
  const [locationCtx, setLocationCtx] = useState<LocationContext | null>(null);
  const [leftTab, setLeftTab] = useState<'feeds' | 'businesses'>('feeds');
  const [mapMode, setMapMode] = useState<'2d' | '3d'>('2d');
  const [showBusinessPins, setShowBusinessPins] = useState(true);
  const [poiResults, setPoiResults] = useState<PoiResult[]>([]);
  const [poiBusy, setPoiBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const poiTooltipRef = useRef<mapboxgl.Popup | null>(null);
  const { data: savedLocations = [], isLoading: savedLocationsLoading } = useSavedLocations();
  const savedLocationPermissions = useSavedLocationPermissions();

  const filteredBusinesses = useMemo(() => {
    if (!locationCtx) return savedLocations;
    return savedLocations.filter((loc) => isInsideLocationContext(loc, locationCtx));
  }, [savedLocations, locationCtx]);

  const filteredBusinessIds = useMemo(
    () => locationCtx ? new Set(filteredBusinesses.map((b) => b.id)) : null,
    [filteredBusinesses, locationCtx]
  );

  const liveTasks = useTrackingStore((s) => s.liveTasks);

  const tasks = useMemo(() => Object.values(liveTasks), [liveTasks]);
  const hasActiveTaskPositions = useMemo(
    () => tasks.some((task) => hasUsableTaskPosition(task)),
    [tasks]
  );
  const selectedTask = selectedTaskId != null ? liveTasks[selectedTaskId] ?? null : null;
  const token = getMapboxPublicToken();
  const internalSearchResults = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return [] as LiveTaskState[];

    return tasks
      .filter(
        (task) =>
          task.agentName.toLowerCase().includes(needle) ||
          (task.taskTitle ?? '').toLowerCase().includes(needle) ||
          (task.projectName ?? '').toLowerCase().includes(needle) ||
          (task.taskAddress ?? '').toLowerCase().includes(needle) ||
          String(task.taskId).includes(needle)
      )
      .slice(0, 8);
  }, [searchQuery, tasks]);

  const savedLocationMatches = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return [] as SavedLocation[];
    return savedLocations
      .filter(
        (loc) =>
          loc.name.toLowerCase().includes(needle) ||
          getSavedLocationLabel(loc.type).toLowerCase().includes(needle) ||
          (loc.address ?? '').toLowerCase().includes(needle)
      )
      .slice(0, 6);
  }, [searchQuery, savedLocations]);

  const handleSearchQueryChange = useCallback((value: string) => {
    setSearchQuery(value);

    if (value.trim().length < 3) {
      setPlaceResults([]);
      setSearchBusy(false);
    }
  }, []);

  const handleLocationSelect = useCallback((ctx: LocationContext | null) => {
    setLocationCtx(ctx);
    if (ctx) setLeftTab('businesses');
    if (!ctx) return;
    const map = mapRef.current;
    if (!map) return;
    if (ctx.bbox) {
      map.fitBounds(
        [[ctx.bbox[0], ctx.bbox[1]], [ctx.bbox[2], ctx.bbox[3]]],
        { padding: 60, duration: 1200 }
      );
    } else {
      map.flyTo({ center: ctx.center, zoom: 13, speed: 1.2 });
    }
  }, []);

  const showHoverPopup = useCallback((position: [number, number], html: string) => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    if (!hoverPopupRef.current) {
      hoverPopupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 18,
        className: 'custom-dark-popup',
      });
    }

    hoverPopupRef.current.setLngLat(position).setHTML(html).addTo(map);
  }, []);

  const hideHoverPopup = useCallback(() => {
    hoverPopupRef.current?.remove();
  }, []);

  const bindHoverPopup = useCallback(
    (element: HTMLElement, getPosition: () => [number, number], getHtml: () => string) => {
      if (element.dataset.hoverBound === 'true') return;

      element.dataset.hoverBound = 'true';
      element.addEventListener('mouseenter', () => showHoverPopup(getPosition(), getHtml()));
      element.addEventListener('mouseleave', hideHoverPopup);
    },
    [hideHoverPopup, showHoverPopup]
  );

  const handlePoiEnter = useCallback((e: mapboxgl.MapLayerMouseEvent) => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = 'pointer';
    const feat = e.features?.[0];
    if (!feat) return;
    const coords = (feat.geometry as { type: string; coordinates: number[] }).coordinates as [number, number];
    const p = feat.properties as Record<string, string>;
    poiTooltipRef.current?.remove();
    poiTooltipRef.current = new mapboxgl.Popup({
      offset: [0, -40],
      closeButton: false,
      closeOnClick: false,
      anchor: 'bottom',
      className: 'poi-tooltip',
    })
      .setLngLat(coords)
      .setHTML(
        '<div style="padding:8px 10px;min-width:150px;max-width:230px;font-family:ui-sans-serif,system-ui,sans-serif">' +
        `<p style="font-weight:700;font-size:13px;color:#0f172a;margin:0;line-height:1.35">${p.name}</p>` +
        `<p style="font-size:11px;color:${p.color};margin:3px 0 0;font-weight:600">${p.category}</p>` +
        (p.address ? `<p style="font-size:11px;color:#64748b;margin:4px 0 0;line-height:1.4">${p.address}</p>` : '') +
        (p.phone ? `<p style="font-size:10px;color:#94a3b8;margin:3px 0 0">📞 ${p.phone}</p>` : '') +
        '</div>'
      )
      .addTo(map);
  }, []);

  const handlePoiLeave = useCallback(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = '';
    poiTooltipRef.current?.remove();
    poiTooltipRef.current = null;
  }, []);

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation || locating) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        mapRef.current?.flyTo({
          center: [lng, lat],
          zoom: 15,
          duration: 1400,
        });
        // Remove blue dot and previous locate pin, then place a red pin
        userLocationMarkerRef.current?.remove();
        userLocationMarkerRef.current = null;
        locateMePinRef.current?.remove();
        if (mapRef.current) {
          locateMePinRef.current = new mapboxgl.Marker({ color: '#EF4444' })
            .setLngLat([lng, lat])
            .addTo(mapRef.current);
        }
      },
      () => setLocating(false),
      { timeout: 10000, enableHighAccuracy: true },
    );
  }, [locating]);

  const animateMarkerTo = useCallback((taskId: number, marker: mapboxgl.Marker, target: [number, number]) => {
    const cached = markerPositionRef.current.get(taskId);
    const current = cached ?? [marker.getLngLat().lng, marker.getLngLat().lat] as [number, number];

    if (areSamePoint(current, target)) {
      marker.setLngLat(target);
      markerPositionRef.current.set(taskId, target);
      return;
    }

    const existingFrame = markerAnimationsRef.current.get(taskId);
    if (existingFrame) {
      cancelAnimationFrame(existingFrame);
      markerAnimationsRef.current.delete(taskId);
    }

    const startedAt = performance.now();

    const step = (frameNow: number) => {
      const progress = Math.min((frameNow - startedAt) / MARKER_ANIMATION_MS, 1);
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      const nextLng = current[0] + (target[0] - current[0]) * eased;
      const nextLat = current[1] + (target[1] - current[1]) * eased;
      marker.setLngLat([nextLng, nextLat]);

      if (progress < 1) {
        const id = requestAnimationFrame(step);
        markerAnimationsRef.current.set(taskId, id);
        return;
      }

      markerAnimationsRef.current.delete(taskId);
      markerPositionRef.current.set(taskId, target);
    };

    const firstFrame = requestAnimationFrame(step);
    markerAnimationsRef.current.set(taskId, firstFrame);
  }, []);

  // ── Staleness clock (state, not Date.now() in render — react-hooks/purity) ─
  useEffect(() => {
    const bump = () => {
      setNowMs(Date.now());
      setTick((t) => t + 1);
      setAppearance(resolveMapAppearance());
    };
    bump();
    const iv = setInterval(bump, 30_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();

    if (!query || query.length < 3 || !token || compact) {
      return;
    }

    const timer = setTimeout(() => {
      let cancelled = false;
      setSearchBusy(true);

      fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&autocomplete=true&limit=6&types=country,region,place,locality,neighborhood,address,poi`
      )
        .then(async (res) => {
          if (!res.ok) {
            return [] as Array<{ id: string; name: string; center: [number, number] }>;
          }

          const json = await res.json();
          const features = Array.isArray(json?.features) ? json.features : [];

          return features
            .filter((feature: unknown): feature is { id: string; place_name: string; center: [number, number]; bbox?: number[] } => {
              if (!feature || typeof feature !== 'object') return false;
              const candidate = feature as { center?: unknown };
              return Array.isArray(candidate.center) && candidate.center.length === 2;
            })
            .map((feature: { id: string; place_name: string; center: [number, number]; bbox?: number[] }) => ({
              id: feature.id,
              name: feature.place_name,
              center: [feature.center[0], feature.center[1]] as [number, number],
              bbox: Array.isArray(feature.bbox) && feature.bbox.length === 4
                ? feature.bbox as [number, number, number, number]
                : null,
            }));
        })
        .then((results) => {
          if (cancelled) return;
          setPlaceResults(results);
        })
        .catch(() => {
          if (cancelled) return;
          setPlaceResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearchBusy(false);
        });

      return () => {
        cancelled = true;
      };
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [compact, searchQuery, token]);

  // Fly to agent when sidebar selection changes (refs only in effects).
  useEffect(() => {
    if (selectedTaskId == null || !mapRef.current) return;
    const task = useTrackingStore.getState().liveTasks[selectedTaskId];
    if (!task) return;
    const [lng, lat] = task.lastPosition;
    mapRef.current.flyTo({ center: [lng, lat], zoom: 15.5, speed: 1.2 });
  }, [selectedTaskId, mapVersion]);

  // Handle Popup & Pulse Marker for Selected Task
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    if (!selectedTask) {
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      if (pulseMarkerRef.current) {
        pulseMarkerRef.current.remove();
        pulseMarkerRef.current = null;
      }
      return;
    }

    const { lastPosition, agentName, agentAvatarUrl, taskTitle, taskAddress } = selectedTask;

    if (!pulseMarkerRef.current) {
      const el = createPulseMarkerElement();
      pulseMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat(lastPosition)
        .addTo(map);
    } else {
      pulseMarkerRef.current.setLngLat(lastPosition);
    }

    if (!popupRef.current) {
      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'custom-dark-popup',
        offset: 20,
      }).addTo(map);
    }

    const popupHtml = buildAgentPopupHtml({
      name: agentName,
      avatarUrl: agentAvatarUrl,
      location: taskAddress || taskTitle || 'No location details',
      statusLabel: getStatusLabel(selectedTask.status),
    });
    popupRef.current.setLngLat(lastPosition).setHTML(popupHtml);
  }, [selectedTask, mapVersion]);

  // ── Init map ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !token) return;
    mapboxgl.accessToken = token;
    const initialViewport = getCountryFallbackViewport();

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: getMapboxNavigationStyle(appearance),
      center: initialViewport.center,
      zoom: compact ? Math.max(initialViewport.zoom, 5.4) : initialViewport.zoom,
      attributionControl: false,
      transformRequest: createMapboxTransformRequest(),
      ...(compact && { interactive: false }),
    });
    mapRef.current = map;

    map.on('load', () => {
      map.addSource('live-routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'route-lines-casing',
        type: 'line',
        source: 'live-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#0095FF',
          'line-width': 12,
          'line-opacity': 0.3,
        },
      });
      map.addLayer({
        id: 'route-lines-main',
        type: 'line',
        source: 'live-routes',
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
      setMapVersion((v) => v + 1);
    });

    return () => {
      mapLoadedRef.current = false;
      markerAnimationsRef.current.forEach((frameId) => cancelAnimationFrame(frameId));
      markerAnimationsRef.current.clear();
      markerPositionRef.current.clear();

      originMarkersRef.current.forEach((marker) => marker.remove());
      destinationMarkersRef.current.forEach((marker) => marker.remove());
      agentMarkersRef.current.forEach((marker) => marker.remove());
      originMarkersRef.current.clear();
      destinationMarkersRef.current.clear();
      agentMarkersRef.current.clear();

      if (popupRef.current) popupRef.current.remove();
      if (pulseMarkerRef.current) pulseMarkerRef.current.remove();
      if (userLocationMarkerRef.current) userLocationMarkerRef.current.remove();
      if (locateMePinRef.current) locateMePinRef.current.remove();
      popupRef.current = null;
      pulseMarkerRef.current = null;
      userLocationMarkerRef.current = null;
      locateMePinRef.current = null;
      if (hoverPopupRef.current) hoverPopupRef.current.remove();
      hoverPopupRef.current = null;
      directionRoutesRef.current.clear();
      clearDirectionsCache();

      map.remove();
      mapRef.current = null;
    };
  }, [token, compact, appearance]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current || hasActiveTaskPositions) {
      return;
    }

    let cancelled = false;

    resolvePrivacySafeViewport().then((viewport) => {
      if (cancelled || !mapRef.current) {
        return;
      }

      const stillIdle = Object.values(useTrackingStore.getState().liveTasks).every(
        (task) => !hasUsableTaskPosition(task)
      );

      if (!stillIdle) {
        return;
      }

      mapRef.current.easeTo({
        center: viewport.center,
        zoom: compact ? Math.max(viewport.zoom - 0.6, 5.4) : viewport.zoom,
        duration: 900,
      });

      if (viewport.granularity === 'gps') {
        if (!userLocationMarkerRef.current) {
          userLocationMarkerRef.current = new mapboxgl.Marker({
            element: createUserLocationIndicatorElement(),
            anchor: 'center',
          })
            .setLngLat(viewport.center)
            .addTo(mapRef.current);
        } else {
          userLocationMarkerRef.current.setLngLat(viewport.center);
        }
      } else {
        userLocationMarkerRef.current?.remove();
        userLocationMarkerRef.current = null;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [compact, hasActiveTaskPositions, mapVersion]);

  useEffect(() => {
    if (hasActiveTaskPositions) {
      userLocationMarkerRef.current?.remove();
      userLocationMarkerRef.current = null;
    }
  }, [hasActiveTaskPositions]);

  // ── Sync live tasks → markers + routes ───────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    const now = nowMs || Date.now();
    const allTrackedTasks = tasks.filter((t) => hasUsableTaskPosition(t));
    const bounds = map.getBounds();
    const maxRenderedMarkers = allTrackedTasks.length > 120 ? 120 : 400;
    const validTasks = allTrackedTasks
      .filter((task) => {
        if (selectedTaskId === task.taskId) return true;
        if (allTrackedTasks.length <= 100) return true;
        if (!bounds) return true;
        return bounds.contains([task.lastPosition[0], task.lastPosition[1]]);
      })
      .sort((a, b) => {
        const aTs = new Date(a.lastEventAt).getTime();
        const bTs = new Date(b.lastEventAt).getTime();
        return bTs - aTs;
      })
      .slice(0, maxRenderedMarkers);
    const validIds = new Set(validTasks.map((t) => t.taskId));
    const routeFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    const destinationIds = new Set<number>();

    validTasks.forEach((task) => {
      const stale = isTaskStale(task.lastEventAt, now);
      const derivedOperationalStatus = resolveOperationalStatusFromTask(task, now, STALE_MS);
      const visualState = resolveVisualTaskState(task.status, stale, derivedOperationalStatus);
      const trail = sanitizePolyline(buildTaskTrail(task));
      const currentPoint = task.lastPosition;

      if (trail.length >= 2) {
        routeFeatures.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: trail },
          properties: {
            taskId: task.taskId,
            status: visualState,
          },
        });
      }

      const originPoint = trail[0] ?? currentPoint;
      const existingOriginMarker = originMarkersRef.current.get(task.taskId);
      if (!existingOriginMarker) {
        const el = createStaticMarkerElement('origin');
        el.title = `Origin - ${task.agentName || `Task ${task.taskId}`}`;
        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat(originPoint)
          .addTo(map);
        originMarkersRef.current.set(task.taskId, marker);
      } else {
        existingOriginMarker.setLngLat(originPoint);
      }

      if (task.destination) {
        destinationIds.add(task.taskId);
        const destinationPoint: [number, number] = [task.destination.lng, task.destination.lat];
        const markerKind = getDestinationMarkerKind(task.status);

        // Forward route rendered via Directions API effect below

        const existingDestinationMarker = destinationMarkersRef.current.get(task.taskId);
        if (!existingDestinationMarker) {
          const el = createStaticMarkerElement(markerKind);
          el.dataset.kind = markerKind;
          const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat(destinationPoint)
            .addTo(map);
          bindHoverPopup(
            el,
            () => destinationPoint,
            () =>
              buildDestinationPopupHtml({
                title:
                  markerKind === 'destination'
                    ? `Destination - ${task.agentName || `Task ${task.taskId}`}`
                    : markerKind === 'near'
                      ? `Near destination - ${task.agentName || `Task ${task.taskId}`}`
                      : markerKind === 'arrived'
                        ? `Arrival reached - ${task.agentName || `Task ${task.taskId}`}`
                        : `Completed - ${task.agentName || `Task ${task.taskId}`}`,
                location: task.taskAddress || task.taskTitle || 'No location details',
                statusLabel: getStatusLabel(task.status),
              })
          );
          destinationMarkersRef.current.set(task.taskId, marker);
        } else {
          const existingKind = existingDestinationMarker.getElement().dataset.kind;
          if (existingKind !== markerKind) {
            existingDestinationMarker.remove();
            const el = createStaticMarkerElement(markerKind);
            el.dataset.kind = markerKind;
            const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
              .setLngLat(destinationPoint)
              .addTo(map);
            bindHoverPopup(
              el,
              () => destinationPoint,
              () =>
                buildDestinationPopupHtml({
                  title:
                    markerKind === 'destination'
                      ? `Destination - ${task.agentName || `Task ${task.taskId}`}`
                      : markerKind === 'near'
                        ? `Near destination - ${task.agentName || `Task ${task.taskId}`}`
                        : markerKind === 'arrived'
                          ? `Arrival reached - ${task.agentName || `Task ${task.taskId}`}`
                          : `Completed - ${task.agentName || `Task ${task.taskId}`}`,
                  location: task.taskAddress || task.taskTitle || 'No location details',
                  statusLabel: getStatusLabel(task.status),
                })
            );
            destinationMarkersRef.current.set(task.taskId, marker);
          } else {
            existingDestinationMarker.setLngLat(destinationPoint);
          }
        }
      }

      const existingAgentMarker = agentMarkersRef.current.get(task.taskId);
      if (!existingAgentMarker) {
        const el = createAgentMarkerElement({
          name: task.agentName,
          avatarUrl: task.agentAvatarUrl,
          visualState,
          stale,
        });
        el.dataset.agentName = task.agentName;
        el.dataset.avatarUrl = task.agentAvatarUrl ?? '';
        el.dataset.location = task.taskAddress || task.taskTitle || 'No location details';
        el.dataset.statusLabel = getStatusLabel(task.status);
        bindHoverPopup(
          el,
          () => task.lastPosition,
          () =>
            buildAgentPopupHtml({
              name: el.dataset.agentName ?? task.agentName,
              avatarUrl: el.dataset.avatarUrl || undefined,
              location: el.dataset.location || task.taskAddress || task.taskTitle || 'No location details',
              statusLabel: el.dataset.statusLabel ?? getStatusLabel(task.status),
            })
        );
        if (!compact) {
          el.addEventListener('click', () => {
            setSelectedTaskId(task.taskId);
            const latest = useTrackingStore.getState().liveTasks[task.taskId];
            if (!latest) return;
            map.flyTo({ center: latest.lastPosition, zoom: 15.5, speed: 1.2 });
          });
        }

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat(task.lastPosition)
          .addTo(map);
        agentMarkersRef.current.set(task.taskId, marker);
        markerPositionRef.current.set(task.taskId, task.lastPosition);
      } else {
        updateAgentMarkerElement(existingAgentMarker.getElement(), {
          name: task.agentName,
          avatarUrl: task.agentAvatarUrl,
          visualState,
          stale,
        });
        existingAgentMarker.getElement().dataset.agentName = task.agentName;
        existingAgentMarker.getElement().dataset.avatarUrl = task.agentAvatarUrl ?? '';
        existingAgentMarker.getElement().dataset.location = task.taskAddress || task.taskTitle || 'No location details';
        existingAgentMarker.getElement().dataset.statusLabel = getStatusLabel(task.status);
        animateMarkerTo(task.taskId, existingAgentMarker, task.lastPosition);
      }
    });

    const routeSource = map.getSource('live-routes') as mapboxgl.GeoJSONSource | undefined;
    routeSource?.setData({
      type: 'FeatureCollection',
      features: routeFeatures,
    });

    // Also render cached forward routes
    const forwardFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    directionRoutesRef.current.forEach((coords, taskId) => {
      if (validIds.has(taskId) && coords.length >= 2) {
        forwardFeatures.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: { taskId },
        });
      }
    });
    const forwardSource = map.getSource('forward-routes') as mapboxgl.GeoJSONSource | undefined;
    forwardSource?.setData({
      type: 'FeatureCollection',
      features: forwardFeatures,
    });

    originMarkersRef.current.forEach((marker, id) => {
      if (!validIds.has(id)) {
        marker.remove();
        originMarkersRef.current.delete(id);
      }
    });

    destinationMarkersRef.current.forEach((marker, id) => {
      if (!destinationIds.has(id)) {
        marker.remove();
        destinationMarkersRef.current.delete(id);
      }
    });

    agentMarkersRef.current.forEach((marker, id) => {
      if (!validIds.has(id)) {
        marker.remove();
        agentMarkersRef.current.delete(id);
        markerPositionRef.current.delete(id);
        const frameId = markerAnimationsRef.current.get(id);
        if (frameId) {
          cancelAnimationFrame(frameId);
          markerAnimationsRef.current.delete(id);
        }
      }
    });
  }, [tasks, tick, compact, mapVersion, nowMs, animateMarkerTo, selectedTaskId, bindHoverPopup]);

  // ── Fetch Mapbox Directions routes for tasks with destinations ───────────────
  useEffect(() => {
    if (!token || !mapLoadedRef.current) return;

    const tasksWithDest = tasks.filter(
      (t) =>
        t.destination &&
        (t.lastPosition[0] !== 0 || t.lastPosition[1] !== 0) &&
        t.status !== 'completed'
    );

    let cancelled = false;

    async function fetchAll() {
      let didChange = false;

      for (const task of tasksWithDest) {
        if (cancelled) return;
        if (!task.destination) continue;

        const origin: [number, number] = task.lastPosition;
        const dest: [number, number] = [task.destination.lng, task.destination.lat];

        // Skip if same point
        if (areSamePoint(origin, dest)) continue;

        const routeResult = await fetchDirectionsRoute(origin, dest, token);
        if (cancelled) return;

        if (routeResult && routeResult.coords.length >= 2) {
          directionRoutesRef.current.set(task.taskId, routeResult.coords);
          didChange = true;
        }
      }

      // Remove routes for tasks that no longer have destinations
      const activeIds = new Set(tasksWithDest.map((t) => t.taskId));
      directionRoutesRef.current.forEach((_, id) => {
        if (!activeIds.has(id)) {
          directionRoutesRef.current.delete(id);
          didChange = true;
        }
      });

      // Update the forward-routes source on the map
      if (didChange && !cancelled && mapRef.current) {
        const forwardFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
        directionRoutesRef.current.forEach((coords, taskId) => {
          if (coords.length >= 2) {
            forwardFeatures.push({
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: coords },
              properties: { taskId },
            });
          }
        });
        const src = mapRef.current.getSource('forward-routes') as mapboxgl.GeoJSONSource | undefined;
        src?.setData({ type: 'FeatureCollection', features: forwardFeatures });
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [tasks, token, mapVersion]);

  // ── Filtered sidebar list ────────────────────────────────────────────────────
  const filteredTasks = searchQuery.trim().length > 0 ? internalSearchResults : tasks;

  // ── Fetch real-world businesses from OpenStreetMap when a location is selected ─
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPoiResults([]);
    if (!locationCtx) return;

    if (locationCtx.bbox && isBboxTooLarge(locationCtx.bbox)) return;

    let cancelled = false;
    setPoiBusy(true);

    const fetch = locationCtx.bbox
      ? fetchBusinessesInBbox(locationCtx.bbox)
      : fetchBusinessesNearPoint(locationCtx.center[1], locationCtx.center[0]);

    fetch.then((results) => {
      if (!cancelled) { setPoiResults(results); setPoiBusy(false); }
    }).catch(() => { if (!cancelled) setPoiBusy(false); });

    return () => { cancelled = true; setPoiBusy(false); };
  }, [locationCtx]);

  // ── Render POI markers on the Mapbox map (GeoJSON layer — hover-stable) ──────
  useEffect(() => {
    let active = true;
    const map = mapRef.current;

    const cleanupLayers = () => {
      poiTooltipRef.current?.remove();
      poiTooltipRef.current = null;
      if (!map) return;
      try {
        if (map.getLayer('poi-pins')) map.removeLayer('poi-pins');
        if (map.getSource('poi-data')) map.removeSource('poi-data');
      } catch { /* map may have been destroyed */ }
    };

    cleanupLayers();

    if (!map || mapVersion === 0 || poiResults.length === 0) return cleanupLayers;

    (async () => {
      // Load a pin SVG image into the map for every unique category colour
      const uniqueColors = [...new Set(poiResults.map((p) => p.categoryColor))];
      await Promise.all(uniqueColors.map((c) => loadPinImage(map, c)));
      if (!active) return;

      map.addSource('poi-data', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: poiResults.map((poi) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [poi.lng, poi.lat] },
            properties: {
              name: poi.name,
              category: poi.categoryLabel,
              color: poi.categoryColor,
              address: poi.address ?? '',
              phone: poi.phone ?? '',
            },
          })),
        },
      });

      map.addLayer({
        id: 'poi-pins',
        type: 'symbol',
        source: 'poi-data',
        layout: {
          // image id = "poi-pin-" + hex without #, e.g. "poi-pin-EA580C"
          'icon-image': ['concat', 'poi-pin-', ['slice', ['get', 'color'], 1]],
          'icon-size': 1,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });

      map.on('mouseenter', 'poi-pins', handlePoiEnter);
      map.on('mouseleave', 'poi-pins', handlePoiLeave);
    })();

    return () => {
      active = false;
      map.off('mouseenter', 'poi-pins', handlePoiEnter);
      map.off('mouseleave', 'poi-pins', handlePoiLeave);
      cleanupLayers();
    };
  }, [poiResults, mapVersion, handlePoiEnter, handlePoiLeave]);

  // ── No token fallback ────────────────────────────────────────────────────────
  if (!token) {
    if (compact) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#F0F0F0] text-sm text-gray-400">
          Map requires {MAPBOX_PUBLIC_TOKEN_ENV}
        </div>
      );
    }
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

  if (compact) {
    return (
      <div className="w-full h-full relative">
        {/* Mount the live tracking WS + hydration so the home widget updates in real time. */}
        <div className="hidden" aria-hidden="true">
          <HydrationBridge onHydrationChange={setIsInitialHydrating} />
        </div>

        <div ref={mapContainer} className="w-full h-full" />

        <SavedLocationsLayer
          provider="mapbox"
          ready={mapVersion > 0}
          getMapboxMap={() => mapRef.current}
          pinMode={false}
          onPinModeChange={() => {}}
          readOnly
        />

        {providerState.fallbackReason === 'missing_google_api_key' && providerState.requestedProvider === 'google' && (
          <div className="absolute bottom-1 left-1 right-1 rounded bg-black/70 px-2 py-1 text-[9px] font-medium text-white">
            Google key missing. Showing Mapbox fallback.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
      <div className="hidden" aria-hidden="true">
        <HydrationBridge onHydrationChange={setIsInitialHydrating} />
      </div>

      {/* Map canvas */}
      <div ref={mapContainer} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

      {/* Search — top, full-width on mobile / top-right on desktop */}
      <div className="absolute top-4 left-4 right-4 md:top-8 md:right-8 md:left-auto md:w-[450px] z-20">
        <div className="relative">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={18} strokeWidth={2} />
          <input
            type="text"
            placeholder="Search places, agents, tasks, references"
            value={searchQuery}
            onChange={(e) => handleSearchQueryChange(e.target.value)}
            className="w-full bg-white rounded-full py-4 pl-14 pr-6 text-[14px] shadow-2xl shadow-black/5 outline-none font-medium text-dash-dark placeholder:text-gray-400"
          />
        </div>

        {(searchBusy || placeResults.length > 0 || savedLocationMatches.length > 0) && searchQuery.trim().length >= 3 && (
          <div className="mt-2 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur px-2 py-2 shadow-xl max-h-[50vh] overflow-y-auto">
            {savedLocationMatches.length > 0 && (
              <div className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Saved locations
              </div>
            )}
            {savedLocationMatches.map((loc) => (
              <button
                key={`saved-${loc.id}`}
                className="w-full text-left px-3 py-2 rounded-xl text-[12px] text-slate-700 hover:bg-slate-100"
                onClick={() => setFocusLocation({ ...loc })}
              >
                <span className="font-semibold">{loc.name}</span>
                <span className="text-slate-400"> · {getSavedLocationLabel(loc.type)}</span>
              </button>
            ))}

            {(placeResults.length > 0 || searchBusy) && savedLocationMatches.length > 0 && (
              <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Places
              </div>
            )}

            {searchBusy && (
              <div className="px-3 py-2 text-[12px] text-slate-500">Searching places...</div>
            )}

            {!searchBusy && placeResults.length === 0 && savedLocationMatches.length === 0 && (
              <div className="px-3 py-2 text-[12px] text-slate-500">No matches found.</div>
            )}

            {placeResults.map((result) => (
              <button
                key={result.id}
                className="w-full text-left px-3 py-2 rounded-xl text-[12px] text-slate-700 hover:bg-slate-100"
                onClick={() => {
                  handleLocationSelect({
                    name: result.name,
                    center: result.center,
                    bbox: result.bbox,
                    radiusKm: 5,
                  });
                  setSearchQuery('');
                  setPlaceResults([]);
                }}
              >
                {result.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Left panel — location search + tabs (Search Feeds / Businesses) */}
      <div className="absolute top-20 left-4 right-4 md:top-8 md:left-8 md:right-auto md:w-[340px] z-20 bg-white rounded-[32px] shadow-2xl shadow-black/10 overflow-hidden flex flex-col max-h-[calc(100vh-120px)]">
        {/* Location filter */}
        <div className="px-4 pt-4 pb-2 shrink-0">
          <LocationSearchInput
            activeLocation={locationCtx}
            onLocationSelect={handleLocationSelect}
            className="w-full"
          />
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-100 shrink-0 mx-4">
          <button
            onClick={() => setLeftTab('feeds')}
            className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors ${leftTab === 'feeds' ? 'text-dash-dark border-b-2 border-dash-dark' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Live Feeds
          </button>
          <button
            onClick={() => setLeftTab('businesses')}
            className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors ${leftTab === 'businesses' ? 'text-dash-dark border-b-2 border-dash-dark' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Businesses {locationCtx ? `(${filteredBusinesses.length})` : ''}
          </button>
        </div>

        {leftTab === 'feeds' ? (
          <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2 space-y-2">
            {isInitialHydrating && filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <span className="w-5 h-5 border-2 border-gray-200 border-t-dash-teal rounded-full animate-spin" />
                <p className="text-[12px] text-gray-400">Loading feeds…</p>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Radio size={24} className="text-gray-200" />
                <p className="text-[12px] text-gray-400">No feeds available</p>
              </div>
            ) : (
              filteredTasks.map((task) => {
                const isSelected = selectedTaskId === task.taskId;
                const operationalStatus = resolveOperationalStatusFromTask(task, nowMs, STALE_MS);
                const statusMeta = OPERATIONAL_STATUS_META[operationalStatus];
                return (
                  <button
                    key={task.taskId}
                    onClick={() => setSelectedTaskId(task.taskId)}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 text-left transition-all rounded-[20px] ${isSelected ? 'bg-[#0A192F]' : 'bg-[#F8FAFC] hover:bg-gray-100'
                      }`}
                  >
                    <AgentAvatar
                      key={`${task.taskId}-${task.agentAvatarUrl ?? ""}`}
                      name={task.agentName}
                      avatarUrl={task.agentAvatarUrl}
                      sizeClassName="w-12 h-12"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p
                          className={`text-[14px] font-bold truncate ${isSelected ? 'text-white' : 'text-dash-dark'
                            }`}
                        >
                          {task.agentName || 'Company Name'}
                        </p>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${isSelected ? 'bg-white/15 text-white border border-white/20' : statusMeta.badgeClassName
                            }`}
                        >
                          {statusMeta.label}
                        </span>
                      </div>
                      <p
                        className={`text-[12px] truncate mt-0.5 ${isSelected ? 'text-gray-300' : 'text-gray-500'
                          }`}
                      >
                        {task.taskAddress ?? task.taskTitle ?? `Task #${task.taskId}`}
                      </p>
                      {(task.projectName ?? '').length > 0 && (
                        <p className={`text-[10px] mt-1 truncate ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                          Project {task.projectName}
                        </p>
                      )}
                      <p className={`text-[10px] mt-1 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                        ETA {formatEta(task.etaSeconds)} | Speed {formatSpeed(task.speedMps)} | Left {formatMetricDistance(task.distanceRemainingMeters)}
                      </p>
                    </div>
                    <MoreHorizontal size={20} className={isSelected ? 'text-white/50' : 'text-gray-400'} />
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <BusinessListPanel
            activeLocation={locationCtx}
            pois={poiResults}
            poiBusy={poiBusy}
            savedLocations={savedLocations}
            savedLocationsLoading={savedLocationsLoading}
            onPoiClick={(p) => {
              mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom: 17, speed: 1.2 });
            }}
            onSavedClick={(b) => {
              mapRef.current?.flyTo({ center: [b.longitude, b.latitude], zoom: 17, speed: 1.2 });
            }}
          />
        )}
      </div>


      {showBusinessPins && (
        <SavedLocationsLayer
          provider="mapbox"
          ready={mapVersion > 0}
          getMapboxMap={() => mapRef.current}
          pinMode={pinMode}
          onPinModeChange={setPinMode}
          focusLocation={focusLocation}
          visibleIds={filteredBusinessIds}
        />
      )}

      <TerritoryLayer
        variant="admin"
        provider="mapbox"
        ready={mapVersion > 0}
        getMapboxMap={() => mapRef.current}
        toggleClassName="absolute bottom-6 left-4 z-30 flex flex-col-reverse items-start gap-2"
      />

      {selectedTask && (() => {
        const operationalStatus = resolveOperationalStatusFromTask(selectedTask, nowMs, STALE_MS);
        const statusMeta = OPERATIONAL_STATUS_META[operationalStatus];

        return (
          <div className="absolute bottom-64 right-4 md:right-10 z-20 w-[min(92vw,380px)] rounded-3xl border border-slate-200 bg-white/95 backdrop-blur shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
              <h4 className="text-[14px] font-bold text-slate-800 flex-1 min-w-0">Active Agent Command Panel</h4>
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold shrink-0 ${statusMeta.badgeClassName}`}>
                {statusMeta.label}
              </span>
              <button
                onClick={() => setSelectedTaskId(null)}
                aria-label="Close panel"
                className="shrink-0 w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 1L11 11M11 1L1 11" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center gap-3">
                <AgentAvatar
                  key={`selected-${selectedTask.taskId}-${selectedTask.agentAvatarUrl ?? ''}`}
                  name={selectedTask.agentName}
                  avatarUrl={selectedTask.agentAvatarUrl}
                  sizeClassName="w-12 h-12"
                />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-slate-900 truncate">{selectedTask.agentName || 'Agent'}</p>
                  <p className="text-[11px] text-slate-500">Role: Agent</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-slate-500">Current Task</p>
                  <p className="font-semibold text-slate-800 truncate">{selectedTask.taskTitle || `Task #${selectedTask.taskId}`}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-slate-500">Current Project</p>
                  <p className="font-semibold text-slate-800 truncate">{selectedTask.projectName ?? 'Unassigned'}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-slate-500">ETA</p>
                  <p className="font-semibold text-slate-800">{formatEta(selectedTask.etaSeconds)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-slate-500">Speed</p>
                  <p className="font-semibold text-slate-800">{formatSpeed(selectedTask.speedMps)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-slate-500">Distance Remaining</p>
                  <p className="font-semibold text-slate-800">{formatMetricDistance(selectedTask.distanceRemainingMeters)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-slate-500">Route Deviation</p>
                  <p className="font-semibold text-slate-800">{formatMetricDistance(selectedTask.routeDeviationMeters)}</p>
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                Last GPS Update: {new Date(selectedTask.lastEventAt).toLocaleString()}
              </p>
            </div>
          </div>
        );
      })()}

      {historyTask && (
        <RouteHistoryPanel
          taskId={historyTask.id}
          taskTitle={historyTask.title}
          onClose={() => setHistoryTask(null)}
        />
      )}

      {providerState.fallbackReason === 'missing_google_api_key' && providerState.requestedProvider === 'google' && (
        <div className="absolute bottom-3 left-3 right-3 md:left-8 md:right-auto md:w-[420px] z-20 rounded-md bg-black/75 px-3 py-2 text-[11px] font-medium text-white">
          Google map is selected by admin, but NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing. Showing Mapbox fallback.
        </div>
      )}

      {/* Map controls — bottom-center, clear of the AI FAB at bottom-right */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
        {/* Toggle business pins */}
        <button
          onClick={() => setShowBusinessPins((visible) => !visible)}
          title={showBusinessPins ? 'Hide business pins' : 'Show business pins'}
          className="h-10 rounded-full bg-white/95 backdrop-blur shadow-lg border border-slate-200 px-4 flex items-center gap-2 text-[12px] font-semibold text-dash-dark hover:bg-slate-50 active:scale-95 transition-all"
        >
          {showBusinessPins ? <EyeOff size={16} /> : <Eye size={16} />}
          {showBusinessPins ? 'Hide Pins' : 'Show Pins'}
        </button>

        {/* Locate me */}
        <button
          onClick={handleLocateMe}
          disabled={locating}
          title="Center on my location"
          className="w-10 h-10 rounded-full bg-white/95 backdrop-blur shadow-lg border border-slate-200 flex items-center justify-center text-dash-teal hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <LocateFixed size={18} className={locating ? 'animate-pulse' : ''} />
        </button>

        {/* 2D / 3D toggle */}
        <div className="flex rounded-full overflow-hidden border border-slate-200 shadow-lg bg-white/95 backdrop-blur">
          <button
            onClick={() => {
              if (mapMode !== '2d') {
                setMapMode('2d');
                mapRef.current?.easeTo({ pitch: 0, bearing: 0, duration: 800 });
              }
            }}
            className={`px-4 py-2 text-[12px] font-semibold transition-colors ${mapMode === '2d' ? 'bg-[#0A192F] text-white' : 'text-slate-500 hover:text-dash-dark'}`}
          >
            2D
          </button>
          <button
            onClick={() => {
              if (mapMode !== '3d') {
                setMapMode('3d');
                mapRef.current?.easeTo({ pitch: 55, bearing: -20, duration: 800 });
              }
            }}
            className={`px-4 py-2 text-[12px] font-semibold transition-colors ${mapMode === '3d' ? 'bg-[#0A192F] text-white' : 'text-slate-500 hover:text-dash-dark'}`}
          >
            3D
          </button>
        </div>
      </div>
    </div>
  );
}

function GoogleMapView({ compact = false, providerState }: MapViewProps & { providerState: EffectiveMapProviderState }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapLike | null>(null);
  const googleRef = useRef<GoogleMapsNamespaceLike | null>(null);
  const agentMarkersRef = useRef<Map<number, GoogleMarkerLike>>(new Map());
  const destinationMarkersRef = useRef<Map<number, GoogleMarkerLike>>(new Map());
  const routeLinesRef = useRef<Map<number, GooglePolylineLike>>(new Map());
  const userLocationMarkerRef = useRef<GoogleMarkerLike | null>(null);
  const locateMePinRef = useRef<GoogleMarkerLike | null>(null);
  const markerAnimationsRef = useRef<Map<number, number>>(new Map());
  const markerPositionRef = useRef<Map<number, [number, number]>>(new Map());

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [historyTask, setHistoryTask] = useState<{ id: number; title: string } | null>(null);
  const [isInitialHydrating, setIsInitialHydrating] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [focusLocation, setFocusLocation] = useState<SavedLocation | null>(null);
  const [locationCtx, setLocationCtx] = useState<LocationContext | null>(null);
  const [leftTab, setLeftTab] = useState<'feeds' | 'businesses'>('feeds');
  const [showBusinessPins, setShowBusinessPins] = useState(true);
  const [poiResults, setPoiResults] = useState<PoiResult[]>([]);
  const [poiBusy, setPoiBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const googlePoiMarkersRef = useRef<{ setMap: (m: unknown) => void }[]>([]);
  const { data: savedLocations = [], isLoading: savedLocationsLoading } = useSavedLocations();
  const savedLocationPermissions = useSavedLocationPermissions();

  const filteredBusinesses = useMemo(() => {
    if (!locationCtx) return savedLocations;
    return savedLocations.filter((loc) => isInsideLocationContext(loc, locationCtx));
  }, [savedLocations, locationCtx]);

  const filteredBusinessIds = useMemo(
    () => locationCtx ? new Set(filteredBusinesses.map((b) => b.id)) : null,
    [filteredBusinesses, locationCtx]
  );

  const liveTasks = useTrackingStore((s) => s.liveTasks);
  const tasks = useMemo(() => Object.values(liveTasks), [liveTasks]);

  // Smoothly tween a Google agent marker between GPS fixes (rAF lerp) so
  // movement reads as continuous instead of teleporting on each update.
  const animateGoogleMarkerTo = useCallback(
    (taskId: number, marker: GoogleMarkerLike, target: [number, number]) => {
      const current = markerPositionRef.current.get(taskId) ?? target;

      if (areSamePoint(current, target)) {
        marker.setPosition({ lat: target[1], lng: target[0] });
        markerPositionRef.current.set(taskId, target);
        return;
      }

      const existingFrame = markerAnimationsRef.current.get(taskId);
      if (existingFrame) {
        cancelAnimationFrame(existingFrame);
        markerAnimationsRef.current.delete(taskId);
      }

      const startedAt = performance.now();
      const step = (frameNow: number) => {
        const progress = Math.min((frameNow - startedAt) / MARKER_ANIMATION_MS, 1);
        const eased =
          progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        marker.setPosition({
          lat: current[1] + (target[1] - current[1]) * eased,
          lng: current[0] + (target[0] - current[0]) * eased,
        });

        if (progress < 1) {
          markerAnimationsRef.current.set(taskId, requestAnimationFrame(step));
          return;
        }

        markerAnimationsRef.current.delete(taskId);
        markerPositionRef.current.set(taskId, target);
      };

      markerAnimationsRef.current.set(taskId, requestAnimationFrame(step));
    },
    [],
  );
  const hasActiveTaskPositions = useMemo(
    () => tasks.some((task) => hasUsableTaskPosition(task)),
    [tasks]
  );
  const googleApiKey = useMemo(() => getGoogleMapsPublicApiKey(), []);

  const savedLocationMatches = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return [] as SavedLocation[];
    return savedLocations
      .filter(
        (loc) =>
          loc.name.toLowerCase().includes(needle) ||
          getSavedLocationLabel(loc.type).toLowerCase().includes(needle) ||
          (loc.address ?? '').toLowerCase().includes(needle)
      )
      .slice(0, 6);
  }, [searchQuery, savedLocations]);

  const handleLocationSelect = useCallback((ctx: LocationContext | null) => {
    setLocationCtx(ctx);
    if (ctx) setLeftTab('businesses');
    if (!ctx || !mapRef.current || !googleRef.current) return;
    if (ctx.bbox) {
      const google = googleRef.current as unknown as { maps: { LatLngBounds: new (sw: { lat: number; lng: number }, ne: { lat: number; lng: number }) => object } };
      const bounds = new google.maps.LatLngBounds(
        { lat: ctx.bbox[1], lng: ctx.bbox[0] },
        { lat: ctx.bbox[3], lng: ctx.bbox[2] }
      );
      mapRef.current.fitBounds(bounds as unknown as GoogleLatLngBoundsLike, 60);
    } else {
      mapRef.current.setCenter({ lat: ctx.center[1], lng: ctx.center[0] });
      mapRef.current.setZoom(13);
    }
  }, []);

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation || locating) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        if (mapRef.current) {
          mapRef.current.panTo({ lat, lng });
          mapRef.current.setZoom(15);
        }
        // Remove blue dot and previous locate pin, then place a red pin
        userLocationMarkerRef.current?.setMap(null);
        userLocationMarkerRef.current = null;
        locateMePinRef.current?.setMap(null);
        if (mapRef.current && googleRef.current) {
          locateMePinRef.current = new googleRef.current.maps.Marker({
            map: mapRef.current,
            position: { lat, lng },
            title: 'Your current location',
          });
        }
      },
      () => setLocating(false),
      { timeout: 10000, enableHighAccuracy: true },
    );
  }, [locating]);

  // ── Fetch real-world businesses when a location is selected ──────────────────
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPoiResults([]);
    if (!locationCtx) return;
    if (locationCtx.bbox && isBboxTooLarge(locationCtx.bbox)) return;

    let cancelled = false;
    setPoiBusy(true);

    const req = locationCtx.bbox
      ? fetchBusinessesInBbox(locationCtx.bbox)
      : fetchBusinessesNearPoint(locationCtx.center[1], locationCtx.center[0]);

    req.then((results) => {
      if (!cancelled) { setPoiResults(results); setPoiBusy(false); }
    }).catch(() => { if (!cancelled) setPoiBusy(false); });

    return () => { cancelled = true; setPoiBusy(false); };
  }, [locationCtx]);

  // ── Render POI markers on Google Maps ────────────────────────────────────────
  useEffect(() => {
    googlePoiMarkersRef.current.forEach((m) => m.setMap(null));
    googlePoiMarkersRef.current = [];

    if (!googleReady || !mapRef.current || !googleRef.current || poiResults.length === 0) return;

    const maps = googleRef.current as unknown as {
      maps: {
        Marker: new (opts: Record<string, unknown>) => { setMap: (m: unknown) => void };
        SymbolPath: { CIRCLE: unknown };
      };
    };

    googlePoiMarkersRef.current = poiResults.map((poi) => {
      const marker = new maps.maps.Marker({
        position: { lat: poi.lat, lng: poi.lng },
        title: `${poi.name} · ${poi.categoryLabel}`,
        icon: {
          path: maps.maps.SymbolPath.CIRCLE,
          fillColor: poi.categoryColor,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 8,
        },
        map: mapRef.current,
      });
      return marker;
    });

    return () => {
      googlePoiMarkersRef.current.forEach((m) => m.setMap(null));
      googlePoiMarkersRef.current = [];
    };
  }, [poiResults, googleReady]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !googleApiKey) {
      return;
    }

    let cancelled = false;

    loadGoogleMapsApi(googleApiKey)
      .then((google) => {
        const googleMaps = google as unknown as GoogleMapsNamespaceLike;

        if (cancelled || !mapContainer.current) {
          return;
        }

        googleRef.current = googleMaps;
        const initialViewport = getCountryFallbackViewport();
        mapRef.current = new googleMaps.maps.Map(mapContainer.current, {
          center: { lat: initialViewport.center[1], lng: initialViewport.center[0] },
          zoom: compact ? Math.max(initialViewport.zoom, 5.4) : initialViewport.zoom,
          disableDefaultUI: compact,
          zoomControl: true,
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: false,
          gestureHandling: compact ? 'none' : 'auto',
        });
        setGoogleReady(true);
      })
      .catch(() => {
        // Key/network failures surface through fallback UI.
      });

    return () => {
      cancelled = true;
      setGoogleReady(false);

      markerAnimationsRef.current.forEach((frame) => cancelAnimationFrame(frame));
      markerAnimationsRef.current.clear();
      markerPositionRef.current.clear();

      routeLinesRef.current.forEach((line) => line.setMap(null));
      destinationMarkersRef.current.forEach((marker) => marker.setMap(null));
      agentMarkersRef.current.forEach((marker) => marker.setMap(null));
      userLocationMarkerRef.current?.setMap(null);
      locateMePinRef.current?.setMap(null);

      routeLinesRef.current.clear();
      destinationMarkersRef.current.clear();
      agentMarkersRef.current.clear();
      userLocationMarkerRef.current = null;
      locateMePinRef.current = null;
      mapRef.current = null;
      googleRef.current = null;
    };
  }, [compact, googleApiKey]);

  useEffect(() => {
    if (selectedTaskId == null || !mapRef.current) return;

    const task = useTrackingStore.getState().liveTasks[selectedTaskId];
    if (!task) return;

    mapRef.current.panTo({ lat: task.lastPosition[1], lng: task.lastPosition[0] });
    if (typeof mapRef.current.getZoom === 'function' && mapRef.current.getZoom() < 15) {
      mapRef.current.setZoom(15);
    }
  }, [selectedTaskId]);

  useEffect(() => {
    if (!mapRef.current || hasActiveTaskPositions) {
      return;
    }

    let cancelled = false;

    resolvePrivacySafeViewport().then((viewport) => {
      if (cancelled || !mapRef.current) {
        return;
      }

      const stillIdle = Object.values(useTrackingStore.getState().liveTasks).every(
        (task) => !hasUsableTaskPosition(task)
      );

      if (!stillIdle) {
        return;
      }

      mapRef.current.setCenter({ lat: viewport.center[1], lng: viewport.center[0] });
      mapRef.current.setZoom(compact ? Math.max(viewport.zoom - 0.6, 5.4) : viewport.zoom);

      if (viewport.granularity === 'gps' && googleRef.current) {
        if (!userLocationMarkerRef.current) {
          userLocationMarkerRef.current = new googleRef.current.maps.Marker({
            map: mapRef.current,
            position: { lat: viewport.center[1], lng: viewport.center[0] },
            title: 'Your current location',
            icon: {
              path: googleRef.current.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#2563EB',
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 3,
            },
          });
        } else {
          userLocationMarkerRef.current.setPosition({ lat: viewport.center[1], lng: viewport.center[0] });
        }
      } else {
        userLocationMarkerRef.current?.setMap(null);
        userLocationMarkerRef.current = null;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [compact, hasActiveTaskPositions]);

  useEffect(() => {
    if (hasActiveTaskPositions) {
      userLocationMarkerRef.current?.setMap(null);
      userLocationMarkerRef.current = null;
    }
  }, [hasActiveTaskPositions]);

  useEffect(() => {
    const map = mapRef.current;
    const google = googleRef.current;

    if (!map || !google) return;

    const now = Date.now();
    const validTasks = tasks.filter((task) => hasUsableTaskPosition(task));
    const validIds = new Set(validTasks.map((task) => task.taskId));
    const destinationIds = new Set<number>();

    validTasks.forEach((task) => {
      const stale = isTaskStale(task.lastEventAt, now);
      const visualState = getVisualState(task, stale);
      const trail = sanitizePolyline(buildTaskTrail(task));

      const routeLine = routeLinesRef.current.get(task.taskId);
      if (trail.length >= 2) {
        if (!routeLine) {
          const line = new google.maps.Polyline({
            map,
            geodesic: true,
            strokeColor: VISUAL_PALETTE[visualState].trail,
            strokeOpacity: 0.92,
            strokeWeight: 4,
          });
          line.setPath(trail.map((point) => ({ lat: point[1], lng: point[0] })));
          routeLinesRef.current.set(task.taskId, line);
        } else {
          routeLine.setOptions({ strokeColor: VISUAL_PALETTE[visualState].trail });
          routeLine.setPath(trail.map((point) => ({ lat: point[1], lng: point[0] })));
        }
      } else if (routeLine) {
        routeLine.setMap(null);
        routeLinesRef.current.delete(task.taskId);
      }

      const current = task.lastPosition;
      const existingAgentMarker = agentMarkersRef.current.get(task.taskId);
      const initials = getAgentInitials(task.agentName) || 'A';

      if (!existingAgentMarker) {
        const marker = new google.maps.Marker({
          map,
          position: { lat: current[1], lng: current[0] },
          title: `${task.agentName || `Task ${task.taskId}`} - ${getStatusLabel(task.status)}`,
          label: {
            text: initials,
            color: '#FFFFFF',
            fontWeight: '700',
          },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 11,
            fillColor: VISUAL_PALETTE[visualState].markerBorder,
            fillOpacity: 1,
            strokeColor: '#FFFFFF',
            strokeWeight: 2,
          },
        });

        if (!compact) {
          marker.addListener('click', () => {
            setSelectedTaskId(task.taskId);
            map.panTo({ lat: current[1], lng: current[0] });
          });
        }

        agentMarkersRef.current.set(task.taskId, marker);
        markerPositionRef.current.set(task.taskId, current);
      } else {
        animateGoogleMarkerTo(task.taskId, existingAgentMarker, current);
        existingAgentMarker.setLabel({
          text: initials,
          color: '#FFFFFF',
          fontWeight: '700',
        });
        existingAgentMarker.setIcon({
          path: google.maps.SymbolPath.CIRCLE,
          scale: 11,
          fillColor: VISUAL_PALETTE[visualState].markerBorder,
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 2,
        });
      }

      if (task.destination) {
        destinationIds.add(task.taskId);
        const destinationPoint = { lat: task.destination.lat, lng: task.destination.lng };
        const markerKind = getDestinationMarkerKind(task.status);
        const destinationColor =
          markerKind === 'completed'
            ? '#334155'
            : markerKind === 'arrived'
              ? '#16A34A'
              : markerKind === 'near'
                ? '#D97706'
                : '#DC2626';

        const existingDestinationMarker = destinationMarkersRef.current.get(task.taskId);
        if (!existingDestinationMarker) {
          const marker = new google.maps.Marker({
            map,
            position: destinationPoint,
            title: `Destination - ${task.agentName || `Task ${task.taskId}`}`,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: destinationColor,
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 3,
            },
          });
          destinationMarkersRef.current.set(task.taskId, marker);
        } else {
          existingDestinationMarker.setPosition(destinationPoint);
          existingDestinationMarker.setIcon({
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: destinationColor,
            fillOpacity: 1,
            strokeColor: '#FFFFFF',
            strokeWeight: 3,
          });
        }
      }
    });

    routeLinesRef.current.forEach((line, id) => {
      if (!validIds.has(id)) {
        line.setMap(null);
        routeLinesRef.current.delete(id);
      }
    });

    destinationMarkersRef.current.forEach((marker, id) => {
      if (!destinationIds.has(id)) {
        marker.setMap(null);
        destinationMarkersRef.current.delete(id);
      }
    });

    agentMarkersRef.current.forEach((marker, id) => {
      if (!validIds.has(id)) {
        marker.setMap(null);
        agentMarkersRef.current.delete(id);
        const frame = markerAnimationsRef.current.get(id);
        if (frame) {
          cancelAnimationFrame(frame);
          markerAnimationsRef.current.delete(id);
        }
        markerPositionRef.current.delete(id);
      }
    });
  }, [compact, tasks, animateGoogleMarkerTo]);

  const filteredTasks = tasks.filter((task) => {
    const needle = searchQuery.toLowerCase();

    return (
      task.agentName.toLowerCase().includes(needle) ||
      (task.taskTitle ?? '').toLowerCase().includes(needle) ||
      (task.projectName ?? '').toLowerCase().includes(needle) ||
      (task.taskAddress ?? '').toLowerCase().includes(needle) ||
      String(task.taskId).includes(needle)
    );
  });

  if (!googleApiKey) {
    if (compact) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#F0F0F0] text-sm text-gray-400">
          Map requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
        </div>
      );
    }

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

  if (compact) {
    return (
      <div className="w-full h-full relative">
        {/* Mount the live tracking WS + hydration so the home widget updates in real time. */}
        <div className="hidden" aria-hidden="true">
          <HydrationBridge onHydrationChange={setIsInitialHydrating} />
        </div>

        <div ref={mapContainer} className="w-full h-full" />

        <SavedLocationsLayer
          provider="google"
          ready={googleReady}
          getGoogleMap={() =>
            mapRef.current && googleRef.current
              ? ({ map: mapRef.current, maps: googleRef.current } as unknown as GoogleMapBridge)
              : null
          }
          pinMode={false}
          onPinModeChange={() => {}}
          readOnly
        />

        {providerState.fallbackReason === 'missing_mapbox_token' && providerState.requestedProvider === 'mapbox' && (
          <div className="absolute bottom-1 left-1 right-1 rounded bg-black/70 px-2 py-1 text-[9px] font-medium text-white">
            Mapbox token missing. Showing Google fallback.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
      <div className="hidden" aria-hidden="true">
        <HydrationBridge onHydrationChange={setIsInitialHydrating} />
      </div>

      <div ref={mapContainer} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

      <div className="absolute top-4 left-4 right-4 md:top-8 md:right-8 md:left-auto md:w-[450px] z-20">
        <div className="relative">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={18} strokeWidth={2} />
          <input
            type="text"
            placeholder="Search for Location"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white rounded-full py-4 pl-14 pr-6 text-[14px] shadow-2xl shadow-black/5 outline-none font-medium text-dash-dark placeholder:text-gray-400"
          />
        </div>

        {savedLocationMatches.length > 0 && searchQuery.trim().length >= 2 && (
          <div className="mt-2 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur px-2 py-2 shadow-xl max-h-[50vh] overflow-y-auto">
            <div className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Saved locations
            </div>
            {savedLocationMatches.map((loc) => (
              <button
                key={`saved-${loc.id}`}
                className="w-full text-left px-3 py-2 rounded-xl text-[12px] text-slate-700 hover:bg-slate-100"
                onClick={() => setFocusLocation({ ...loc })}
              >
                <span className="font-semibold">{loc.name}</span>
                <span className="text-slate-400"> · {getSavedLocationLabel(loc.type)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Left panel — location search + tabs (Search Feeds / Businesses) */}
      <div className="absolute top-20 left-4 right-4 md:top-8 md:left-8 md:right-auto md:w-[340px] z-20 bg-white rounded-[32px] shadow-2xl shadow-black/10 overflow-hidden flex flex-col max-h-[calc(100vh-120px)]">
        {/* Location filter */}
        <div className="px-4 pt-4 pb-2 shrink-0">
          <LocationSearchInput
            activeLocation={locationCtx}
            onLocationSelect={handleLocationSelect}
            className="w-full"
          />
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-100 shrink-0 mx-4">
          <button
            onClick={() => setLeftTab('feeds')}
            className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors ${leftTab === 'feeds' ? 'text-dash-dark border-b-2 border-dash-dark' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Live Feeds
          </button>
          <button
            onClick={() => setLeftTab('businesses')}
            className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors ${leftTab === 'businesses' ? 'text-dash-dark border-b-2 border-dash-dark' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Businesses {locationCtx ? `(${filteredBusinesses.length})` : ''}
          </button>
        </div>

        {leftTab === 'feeds' ? (
          <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2 space-y-2">
            {isInitialHydrating && filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <span className="w-5 h-5 border-2 border-gray-200 border-t-dash-teal rounded-full animate-spin" />
                <p className="text-[12px] text-gray-400">Loading feeds…</p>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Radio size={24} className="text-gray-200" />
                <p className="text-[12px] text-gray-400">No feeds available</p>
              </div>
            ) : (
              filteredTasks.map((task) => {
                const isSelected = selectedTaskId === task.taskId;
                return (
                  <button
                    key={task.taskId}
                    onClick={() => setSelectedTaskId(task.taskId)}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 text-left transition-all rounded-[20px] ${isSelected ? 'bg-[#0A192F]' : 'bg-[#F8FAFC] hover:bg-gray-100'
                      }`}
                  >
                    <AgentAvatar
                      key={`${task.taskId}-${task.agentAvatarUrl ?? ''}`}
                      name={task.agentName}
                      avatarUrl={task.agentAvatarUrl}
                      sizeClassName="w-12 h-12"
                      allowInitialsFallback={false}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-[14px] font-bold truncate ${isSelected ? 'text-white' : 'text-dash-dark'
                          }`}
                      >
                        {task.agentName || 'Company Name'}
                      </p>
                      <p
                        className={`text-[12px] truncate mt-0.5 ${isSelected ? 'text-gray-400' : 'text-gray-500'
                          }`}
                      >
                        {task.taskAddress ?? task.taskTitle ?? `Task #${task.taskId}`}
                      </p>
                    </div>
                    <MoreHorizontal size={20} className={isSelected ? 'text-white/50' : 'text-gray-400'} />
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <BusinessListPanel
            activeLocation={locationCtx}
            pois={poiResults}
            poiBusy={poiBusy}
            savedLocations={savedLocations}
            savedLocationsLoading={savedLocationsLoading}
            onPoiClick={(p) => {
              mapRef.current?.panTo({ lat: p.lat, lng: p.lng });
              if ((mapRef.current?.getZoom() ?? 0) < 17) mapRef.current?.setZoom(17);
            }}
            onSavedClick={(b) => {
              mapRef.current?.panTo({ lat: b.latitude, lng: b.longitude });
              if ((mapRef.current?.getZoom() ?? 0) < 17) mapRef.current?.setZoom(17);
            }}
          />
        )}
      </div>


      {showBusinessPins && (
        <SavedLocationsLayer
          provider="google"
          ready={googleReady}
          getGoogleMap={() =>
            mapRef.current && googleRef.current
              ? ({ map: mapRef.current, maps: googleRef.current } as unknown as GoogleMapBridge)
              : null
          }
          pinMode={pinMode}
          onPinModeChange={setPinMode}
          focusLocation={focusLocation}
          visibleIds={filteredBusinessIds}
        />
      )}

      <TerritoryLayer
        variant="admin"
        provider="google"
        ready={googleReady}
        getGoogleMap={() => (mapRef.current ? { map: mapRef.current } : null)}
        toggleClassName="absolute bottom-6 left-4 z-30 flex flex-col-reverse items-start gap-2"
      />

      {historyTask && (
        <RouteHistoryPanel
          taskId={historyTask.id}
          taskTitle={historyTask.title}
          onClose={() => setHistoryTask(null)}
        />
      )}

      {/* Map controls — bottom-center, clear of the AI FAB at bottom-right */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
        <button
          onClick={() => setShowBusinessPins((visible) => !visible)}
          title={showBusinessPins ? 'Hide business pins' : 'Show business pins'}
          className="h-10 rounded-full bg-white/95 backdrop-blur shadow-lg border border-slate-200 px-4 flex items-center gap-2 text-[12px] font-semibold text-dash-dark hover:bg-slate-50 active:scale-95 transition-all"
        >
          {showBusinessPins ? <EyeOff size={16} /> : <Eye size={16} />}
          {showBusinessPins ? 'Hide Pins' : 'Show Pins'}
        </button>

        <button
          onClick={handleLocateMe}
          disabled={locating}
          title="Center on my location"
          className="w-10 h-10 rounded-full bg-white/95 backdrop-blur shadow-lg border border-slate-200 flex items-center justify-center text-dash-teal hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <LocateFixed size={18} className={locating ? 'animate-pulse' : ''} />
        </button>
      </div>

      {providerState.fallbackReason === 'missing_mapbox_token' && providerState.requestedProvider === 'mapbox' && (
        <div className="absolute bottom-3 left-3 right-3 md:left-8 md:right-auto md:w-[420px] z-20 rounded-md bg-black/75 px-3 py-2 text-[11px] font-medium text-white">
          Mapbox is selected by admin, but NEXT_PUBLIC_MAPBOX_TOKEN is missing. Showing Google fallback.
        </div>
      )}
    </div>
  );
}

export function MapView(props: MapViewProps) {
  const providerState = useEffectiveMapProvider();

  if (providerState.effectiveProvider === 'google') {
    return <GoogleMapView {...props} providerState={providerState} />;
  }

  return <MapboxMapView {...props} providerState={providerState} />;
}

function HydrationBridge({
  onHydrationChange,
}: {
  onHydrationChange: (isHydrating: boolean) => void;
}) {
  const { isInitialHydrating } = useTrackingWebSocket();

  useEffect(() => {
    onHydrationChange(isInitialHydrating);
  }, [isInitialHydrating, onHydrationChange]);

  return null;
}

function AgentAvatar({
  name,
  avatarUrl,
  sizeClassName,
  initialsClassName = 'text-[12px]',
  allowInitialsFallback = true,
}: {
  name: string;
  avatarUrl?: string;
  sizeClassName: string;
  initialsClassName?: string;
  allowInitialsFallback?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  const initials = getAgentInitials(name);
  const showImage = !!avatarUrl && !imageFailed;

  return (
    <div className={`${sizeClassName} rounded-full overflow-hidden shrink-0 border-2 border-white shadow-sm bg-gray-100 flex items-center justify-center`}>
      {showImage ? (
        <img
          src={avatarUrl}
          className="w-full h-full object-cover"
          alt={name || 'Agent'}
          onError={() => setImageFailed(true)}
        />
      ) : initials && allowInitialsFallback ? (
        <span className={`${initialsClassName} font-bold text-gray-500`}>
          {initials}
        </span>
      ) : (
        <span aria-hidden="true" className="block w-full h-full bg-transparent" />
      )}
    </div>
  );
}
