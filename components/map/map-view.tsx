'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { Search, X, Radio, Route } from 'lucide-react';
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
  buildDirectionSegment,
  buildTaskTrail,
  createAgentMarkerElement,
  createStaticMarkerElement,
  getAgentInitials,
  resolveVisualTaskState,
  sanitizePolyline,
  updateAgentMarkerElement,
  VISUAL_PALETTE,
  type VisualTaskState,
} from '@/lib/tracking/map-visualization';

const STALE_MS = 2 * 60_000;
const MARKER_ANIMATION_MS = 700;

function isTaskStale(lastEventAt: string, nowMs: number): boolean {
  if (!lastEventAt || !nowMs) return false;
  return nowMs - new Date(lastEventAt).getTime() > STALE_MS;
}

function getStatusLabel(status: LiveTaskState['status']): string {
  if (status === 'arrived') return 'Arrived';
  if (status === 'completed') return 'Completed';
  return 'On field';
}

function getDestinationMarkerKind(status: LiveTaskState['status']): 'destination' | 'arrived' | 'completed' {
  if (status === 'completed') return 'completed';
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

  useEffect(() => {
    if (selectedTaskId != null && !liveTasks[selectedTaskId]) {
      setSelectedTaskId(null);
    }
  }, [liveTasks, selectedTaskId]);

  // Fly to agent when sidebar selection changes (refs only in effects).
  useEffect(() => {
    if (selectedTaskId == null || !mapRef.current) return;
    const task = useTrackingStore.getState().liveTasks[selectedTaskId];
    if (!task) return;
    const [lng, lat] = task.lastPosition;
    mapRef.current.flyTo({ center: [lng, lat], zoom: 14, speed: 1.2 });
  }, [selectedTaskId, mapVersion]);

  // ── Init map ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !token) return;
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [3.36, 6.595],
      zoom: compact ? 11.5 : 12.5,
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
          'line-color': '#FFFFFF',
          'line-width': 8,
          'line-opacity': 0.75,
        },
      });
      map.addLayer({
        id: 'route-lines-main',
        type: 'line',
        source: 'live-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': [
            'match',
            ['get', 'status'],
            'arrived',
            VISUAL_PALETTE.arrived.trail,
            'completed',
            VISUAL_PALETTE.completed.trail,
            'stale',
            VISUAL_PALETTE.stale.trail,
            VISUAL_PALETTE.in_progress.trail,
          ],
          'line-width': 4,
          'line-opacity': 0.92,
        },
      });

      map.addSource('live-connectors', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'route-connectors',
        type: 'line',
        source: 'live-connectors',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': [
            'match',
            ['get', 'status'],
            'arrived',
            VISUAL_PALETTE.arrived.connector,
            'completed',
            VISUAL_PALETTE.completed.connector,
            'stale',
            VISUAL_PALETTE.stale.connector,
            VISUAL_PALETTE.in_progress.connector,
          ],
          'line-width': 3,
          'line-opacity': 0.82,
          'line-dasharray': [2, 2],
        },
      });

      map.addSource('live-direction', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'route-direction',
        type: 'line',
        source: 'live-direction',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': [
            'match',
            ['get', 'status'],
            'arrived',
            '#15803D',
            'completed',
            '#1E293B',
            'stale',
            '#64748B',
            '#075985',
          ],
          'line-width': 5,
          'line-opacity': 0.95,
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
    const connectorFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    const directionFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
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

        const directionSegment = buildDirectionSegment(trail);
        if (directionSegment) {
          directionFeatures.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: directionSegment },
            properties: {
              taskId: task.taskId,
              status: visualState,
            },
          });
        }
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

        if (!areSamePoint(currentPoint, destinationPoint)) {
          connectorFeatures.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [currentPoint, destinationPoint],
            },
            properties: {
              taskId: task.taskId,
              status: visualState,
            },
          });
        }

        const existingDestinationMarker = destinationMarkersRef.current.get(task.taskId);
        if (!existingDestinationMarker) {
          const el = createStaticMarkerElement(markerKind);
          el.dataset.kind = markerKind;
          el.title =
            markerKind === 'destination'
              ? `Destination - ${task.agentName || `Task ${task.taskId}`}`
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
            map.flyTo({ center: latest.lastPosition, zoom: 14, speed: 1.2 });
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

    const connectorSource = map.getSource('live-connectors') as mapboxgl.GeoJSONSource | undefined;
    connectorSource?.setData({
      type: 'FeatureCollection',
      features: connectorFeatures,
    });

    const directionSource = map.getSource('live-direction') as mapboxgl.GeoJSONSource | undefined;
    directionSource?.setData({
      type: 'FeatureCollection',
      features: directionFeatures,
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
      <div className="absolute top-5 right-5 z-20 w-80">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
          <input
            type="text"
            placeholder="Search agents or tasks"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white rounded-full py-3.5 pl-11 pr-5 text-[13px] shadow-lg outline-none border border-gray-100"
          />
        </div>
      </div>

      {/* Live Agents panel — left */}
      <div className="absolute top-5 left-5 z-20 w-72 bg-white rounded-3xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-bold text-dash-dark">Live Agents</h3>
            {tasks.length > 0 && (
              <span className="text-[11px] text-gray-400 font-medium">({tasks.length})</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-amber-400'
                }`}
            />
            <span className="text-[10px] text-gray-400">
              {isInitialHydrating
                ? 'Hydrating…'
                : wsConnected
                  ? 'Live'
                  : wsStatus === 'reconnecting'
                    ? 'Reconnecting…'
                    : 'Connecting'}
            </span>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-50">
          {isInitialHydrating && filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <span className="w-5 h-5 border-2 border-gray-200 border-t-dash-teal rounded-full animate-spin" />
              <p className="text-[12px] text-gray-400">Loading active agents…</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Radio size={24} className="text-gray-200" />
              <p className="text-[12px] text-gray-400">No agents currently tracked</p>
            </div>
          ) : (
            filteredTasks.map((task) => {
              const stale = isTaskStale(task.lastEventAt, nowMs);
              const isSelected = selectedTaskId === task.taskId;
              return (
                <button
                  key={task.taskId}
                  onClick={() => setSelectedTaskId(task.taskId)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all ${isSelected ? 'bg-dash-dark' : 'hover:bg-gray-50'
                    }`}
                >
                  <AgentAvatar name={task.agentName} avatarUrl={task.agentAvatarUrl} sizeClassName="w-10 h-10" />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-[13px] font-bold truncate ${isSelected ? 'text-white' : 'text-dash-dark'
                        }`}
                    >
                      {task.agentName || 'Agent'}
                    </p>
                    <p
                      className={`text-[11px] truncate mt-0.5 ${isSelected ? 'text-white/50' : 'text-gray-400'
                        }`}
                    >
                      {task.taskAddress ?? task.taskTitle ?? `Task #${task.taskId}`}
                    </p>
                  </div>
                  {task.destination && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-red-500 mr-1">
                      D
                    </span>
                  )}
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      backgroundColor: VISUAL_PALETTE[getVisualState(task, stale)].markerBorder,
                    }}
                  />
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Selected agent popup — below search bar */}
      {selectedTask && (
        <div className="absolute top-20 right-5 z-20 w-64 bg-white rounded-3xl shadow-2xl p-5 animate-in zoom-in-95 fade-in duration-200">
          <div className="flex items-center justify-between mb-4">
            <span
              className="text-[12px] font-bold"
              style={{
                color: VISUAL_PALETTE[
                  getVisualState(selectedTask, isTaskStale(selectedTask.lastEventAt, nowMs))
                ].markerBorder,
              }}
            >
              {selectedTask.status === 'arrived'
                ? 'Arrived at destination'
                : selectedTask.status === 'completed'
                  ? 'Task completed'
                  : 'Currently tracking'}
            </span>
            <button
              onClick={() => setSelectedTaskId(null)}
              className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 transition-all"
            >
              <X size={11} />
            </button>
          </div>

          <div className="flex justify-center mb-3">
            <AgentAvatar
              name={selectedTask.agentName}
              avatarUrl={selectedTask.agentAvatarUrl}
              sizeClassName="w-20 h-20"
              initialsClassName="text-[22px]"
            />
          </div>

          <div className="text-center space-y-1 mb-4">
            <h4 className="text-[14px] font-bold text-dash-dark">
              {selectedTask.agentName || 'Agent'}
            </h4>
            <p className="text-[11px] text-gray-400 line-clamp-2">{selectedTask.taskTitle}</p>
            {selectedTask.taskAddress && (
              <p className="text-[10px] text-gray-400 line-clamp-1">{selectedTask.taskAddress}</p>
            )}
            <div
              className="inline-block px-3.5 py-1.5 rounded-full text-[10px] font-bold mt-1"
              style={{
                backgroundColor: `${VISUAL_PALETTE[getVisualState(selectedTask, isTaskStale(selectedTask.lastEventAt, nowMs))].markerBorder}20`,
                color: VISUAL_PALETTE[getVisualState(selectedTask, isTaskStale(selectedTask.lastEventAt, nowMs))].markerText,
              }}
            >
              {getStatusLabel(selectedTask.status)}
            </div>
          </div>

          <button
            onClick={() =>
              setHistoryTask({
                id: selectedTask.taskId,
                title: selectedTask.taskTitle || `Task #${selectedTask.taskId}`,
              })
            }
            className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-100 rounded-2xl text-[12px] font-semibold text-gray-500 hover:bg-gray-50 transition-all"
          >
            <Route size={14} />
            View route history
          </button>
        </div>
      )}

      <div className="absolute bottom-5 right-5 z-20 bg-white/95 backdrop-blur rounded-2xl shadow-lg border border-gray-100 px-4 py-3 w-64">
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Live legend</p>
        <div className="space-y-2 text-[11px] text-gray-600">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-[#2563EB] border-2 border-white shadow" />
            Origin
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-[#DC2626] border-2 border-white shadow" />
            Destination
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-[#16A34A] border-2 border-white shadow" />
            Arrived
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-[#334155] border-2 border-white shadow" />
            Completed
          </div>
          <div className="flex items-center gap-2">
            <span className="w-7 h-1 rounded-full bg-[#0284C7]" />
            Historical route
          </div>
          <div className="flex items-center gap-2">
            <span className="w-7 h-0.5 rounded-full bg-[#38BDF8]" style={{ borderTop: '2px dashed #38BDF8' }} />
            Current to destination
          </div>
        </div>
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

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

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
