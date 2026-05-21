'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { Search, X, Radio, Route, RefreshCcw, MoreHorizontal } from 'lucide-react';
import {
  MAPBOX_PUBLIC_TOKEN_ENV,
  createMapboxTransformRequest,
  getMapboxPublicToken,
} from '@/lib/config/public-env';
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

const STALE_MS = 2 * 60_000;
const MARKER_ANIMATION_MS = 700;

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

function getDestinationMarkerKind(status: LiveTaskState['status']): 'destination' | 'near' | 'arrived' | 'completed' {
  if (status === 'completed') return 'completed';
  if (status === 'near_destination') return 'near';
  if (status === 'arrived') return 'arrived';
  return 'destination';
}

function getVisualState(task: LiveTaskState, stale: boolean): VisualTaskState {
  return resolveVisualTaskState(task.status, stale);
}

interface MapViewProps {
  compact?: boolean;
}

export function MapView({ compact = false }: MapViewProps) {
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
  const directionRoutesRef = useRef<Map<number, [number, number][]>>(new Map());

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [historyTask, setHistoryTask] = useState<{ id: number; title: string } | null>(null);
  // Bumped every 30s to re-evaluate stale status and sync markers
  const [tick, setTick] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  // Flips true after map 'load' fires so the sync effect knows the map is ready
  const [mapVersion, setMapVersion] = useState(0);
  const [isInitialHydrating, setIsInitialHydrating] = useState(false);

  const liveTasks = useTrackingStore((s) => s.liveTasks);
  const wsStatus = useTrackingStore((s) => s.wsStatus);

  const tasks = useMemo(() => Object.values(liveTasks), [liveTasks]);
  const selectedTask = selectedTaskId != null ? liveTasks[selectedTaskId] ?? null : null;
  const token = getMapboxPublicToken();

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
    };
    bump();
    const iv = setInterval(bump, 30_000);
    return () => clearInterval(iv);
  }, []);

  if (selectedTaskId != null && !liveTasks[selectedTaskId]) {
    setSelectedTaskId(null);
  }

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

    const popupHtml = `
      <div style="background-color: #0A192F; border-radius: 16px; padding: 12px; display: flex; align-items: center; gap: 16px; min-width: 240px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4);">
         <div style="width: 64px; height: 64px; border-radius: 12px; overflow: hidden; background: #1E293B; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
            ${agentAvatarUrl ? `<img src="${agentAvatarUrl}" style="width: 100%; height: 100%; object-fit: cover;" />` : `<div style="color: white; font-weight: bold; font-size: 20px;">#</div>`}
         </div>
         <div style="flex: 1;">
            <div style="color: white; font-weight: 700; font-size: 14px; margin-bottom: 4px; font-family: sans-serif;">${agentName || 'Agent'}</div>
            <div style="color: #94A3B8; font-size: 11px; line-height: 1.4; font-family: sans-serif;">${taskAddress || taskTitle || 'No location details'}</div>
         </div>
      </div>
    `;
    popupRef.current.setLngLat(lastPosition).setHTML(popupHtml);
  }, [selectedTask, mapVersion]);

  // ── Init map ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !token) return;
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [3.36, 6.595],
      zoom: compact ? 12.5 : 14.5,
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
      popupRef.current = null;
      pulseMarkerRef.current = null;
      directionRoutesRef.current.clear();
      clearDirectionsCache();

      map.remove();
      mapRef.current = null;
    };
  }, [token, compact]);

  // ── Sync live tasks → markers + routes ───────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    const now = nowMs || Date.now();
    const validTasks = tasks.filter(
      (t) => t.lastPosition[0] !== 0 || t.lastPosition[1] !== 0
    );
    const validIds = new Set(validTasks.map((t) => t.taskId));
    const routeFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    const destinationIds = new Set<number>();

    validTasks.forEach((task) => {
      const stale = isTaskStale(task.lastEventAt, now);
      const visualState = getVisualState(task, stale);
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
          el.title =
            markerKind === 'destination'
              ? `Destination - ${task.agentName || `Task ${task.taskId}`}`
              : markerKind === 'near'
                ? `Near destination - ${task.agentName || `Task ${task.taskId}`}`
                : markerKind === 'arrived'
                  ? `Arrival reached - ${task.agentName || `Task ${task.taskId}`}`
                  : `Completed - ${task.agentName || `Task ${task.taskId}`}`;
          const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat(destinationPoint)
            .addTo(map);
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
        el.title = `${task.agentName || `Task ${task.taskId}`} - ${getStatusLabel(task.status)}`;
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
        existingAgentMarker.getElement().setAttribute(
          'title',
          `${task.agentName || `Task ${task.taskId}`} - ${getStatusLabel(task.status)}`
        );
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
  }, [tasks, tick, compact, mapVersion, nowMs, animateMarkerTo]);

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

        const routeCoords = await fetchDirectionsRoute(origin, dest, token);
        if (cancelled) return;

        if (routeCoords && routeCoords.length >= 2) {
          directionRoutesRef.current.set(task.taskId, routeCoords);
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
  const filteredTasks = tasks.filter(
    (t) =>
      t.agentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.taskTitle ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.taskAddress ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const wsConnected = wsStatus === 'connected';

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
    return <div ref={mapContainer} className="w-full h-full" />;
  }

  return (
    <div className="relative w-full overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
      <div className="hidden" aria-hidden="true">
        <HydrationBridge onHydrationChange={setIsInitialHydrating} />
      </div>

      {/* Map canvas */}
      <div ref={mapContainer} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

      {/* Search — top right */}
      <div className="absolute top-8 right-8 z-20 w-[450px]">
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
      </div>

      {/* Search Feeds panel — left */}
      <div className="absolute top-8 left-8 z-20 w-[340px] bg-white rounded-[32px] shadow-2xl shadow-black/10 overflow-hidden flex flex-col max-h-[calc(100vh-120px)]">
        <div className="flex items-center justify-between px-6 py-6 pb-4">
          <h3 className="text-[18px] font-bold text-dash-dark">Search Feeds</h3>
          <button className="w-9 h-9 rounded-full bg-[#0A192F] flex items-center justify-center hover:bg-gray-800 transition-colors">
            <RefreshCcw size={15} className="text-[#38BDF8]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
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
                    key={`${task.taskId}-${task.agentAvatarUrl ?? ""}`}
                    name={task.agentName}
                    avatarUrl={task.agentAvatarUrl}
                    sizeClassName="w-12 h-12"
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
      </div>

      {/* Floating Action Button */}
      <div className="absolute bottom-10 right-10 z-20">
        <button className="bg-gradient-to-r from-[#D946EF] to-[#9333EA] hover:from-[#C026D3] hover:to-[#7E22CE] text-white px-8 py-3.5 rounded-full font-bold text-[14px] shadow-xl shadow-purple-500/30 transition-all flex items-center gap-2">
          Location Mapping
        </button>
      </div>

      {historyTask && (
        <RouteHistoryPanel
          taskId={historyTask.id}
          taskTitle={historyTask.title}
          onClose={() => setHistoryTask(null)}
        />
      )}
    </div>
  );
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
}: {
  name: string;
  avatarUrl?: string;
  sizeClassName: string;
  initialsClassName?: string;
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
      ) : initials ? (
        <span className={`${initialsClassName} font-bold text-gray-500`}>
          {initials}
        </span>
      ) : (
        <span className={`${initialsClassName} font-bold text-gray-500`}>#</span>
      )}
    </div>
  );
}
