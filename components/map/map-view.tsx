'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { Search, MessageSquare, X, Radio } from 'lucide-react';
import { useTrackingStore } from '@/store/tracking';
import { useTrackingWebSocket } from '@/hooks/use-tracking-ws';
import type { LiveTaskState } from '@/types/tracking';

const STALE_MS = 2 * 60_000;

function isTaskStale(lastEventAt: string, nowMs: number): boolean {
  if (!lastEventAt || !nowMs) return false;
  return nowMs - new Date(lastEventAt).getTime() > STALE_MS;
}

function getStatusColor(status: string, stale: boolean): string {
  if (stale) return '#9CA3AF';
  if (status === 'arrived') return '#8B5CF6';
  if (status === 'completed') return '#10B981';
  return '#EF4444';
}

function buildAgentEl(task: LiveTaskState, stale: boolean): HTMLElement {
  const color = getStatusColor(task.status, stale);
  const initials = task.agentName
    ? task.agentName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';
  const avatarHtml = task.agentAvatarUrl
    ? `<img src="${task.agentAvatarUrl}" style="width:22px;height:22px;border-radius:50%;object-fit:cover;border:1.5px solid #e5e7eb;"/>`
    : `<div style="width:22px;height:22px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:white;">${initials}</div>`;
  const statusText = stale
    ? 'No signal'
    : task.status === 'arrived'
    ? 'Arrived'
    : task.status === 'completed'
    ? 'Completed'
    : 'Live';

  const el = document.createElement('div');
  el.style.cssText =
    'display:flex;flex-direction:column;align-items:center;cursor:pointer;user-select:none;';
  el.innerHTML = `
    <svg width="30" height="36" viewBox="0 0 30 36" fill="none">
      <path d="M15 0C6.716 0 0 6.716 0 15c0 9.941 13.5 21 15 21S30 24.941 30 15C30 6.716 23.284 0 15 0z" fill="${color}"/>
      <circle cx="15" cy="14" r="6" fill="white"/>
    </svg>
    <div style="background:white;border-radius:20px;padding:3px 8px 3px 4px;display:flex;align-items:center;gap:5px;box-shadow:0 2px 8px rgba(0,0,0,0.15);margin-top:4px;white-space:nowrap;opacity:${stale ? 0.6 : 1};">
      ${avatarHtml}
      <div style="line-height:1.2;">
        <div style="font-size:10px;font-weight:700;color:#0B1215;">${task.agentName || 'Agent'}</div>
        <div style="font-size:8px;color:${color};">${statusText}</div>
      </div>
    </div>`;
  return el;
}

// Mounts the WS hook — extracted so it only runs in full (non-compact) view.
function WsConnector() {
  useEffect(() => {
    console.log(
      "[tracking-ws]",
      "WsConnector mounted on map page — listening for live events only.",
      "Your device location is requested when an agent starts tracking a task (Operations → Commence, or /agent/tasks/.../tracking)."
    );
    return () => console.log("[tracking-ws]", "WsConnector unmounted");
  }, []);
  useTrackingWebSocket();
  return null;
}

interface MapViewProps {
  compact?: boolean;
}

export function MapView({ compact = false }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapLoadedRef = useRef(false);
  const agentMarkersRef = useRef<Map<number, { marker: mapboxgl.Marker; statusKey: string }>>(
    new Map()
  );
  const destMarkersRef = useRef<Map<number, mapboxgl.Marker>>(new Map());

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  // Bumped every 30s to re-evaluate stale status and sync markers
  const [tick, setTick] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  // Flips true after map 'load' fires so the sync effect knows the map is ready
  const [mapVersion, setMapVersion] = useState(0);

  const liveTasks = useTrackingStore((s) => s.liveTasks);
  const wsStatus = useTrackingStore((s) => s.wsStatus);

  const tasks = Object.values(liveTasks);
  const selectedTask = selectedTaskId != null ? liveTasks[selectedTaskId] ?? null : null;
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

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
    // Mapbox GL requires a global token before Map construction.
    // eslint-disable-next-line react-hooks/immutability -- third-party API
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [3.36, 6.595],
      zoom: compact ? 11.5 : 12.5,
      attributionControl: false,
      ...(compact && { interactive: false }),
    });
    mapRef.current = map;

    map.on('load', () => {
      // GeoJSON source backing all agent route polylines
      map.addSource('live-routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'route-lines',
        type: 'line',
        source: 'live-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': [
            'match',
            ['get', 'status'],
            'arrived',
            '#8B5CF6',
            'completed',
            '#10B981',
            '#3B82F6',
          ],
          'line-width': 3,
          'line-opacity': 0.6,
        },
      });
      mapLoadedRef.current = true;
      setMapVersion((v) => v + 1);
    });

    return () => {
      mapLoadedRef.current = false;
      map.remove();
      mapRef.current = null;
      agentMarkersRef.current.forEach(({ marker }) => marker.remove());
      agentMarkersRef.current.clear();
      destMarkersRef.current.forEach((m) => m.remove());
      destMarkersRef.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, compact]);

  // ── Sync live tasks → markers + routes ───────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    const now = Date.now();
    const validTasks = tasks.filter(
      (t) => t.lastPosition[0] !== 0 || t.lastPosition[1] !== 0
    );
    const validIds = new Set(validTasks.map((t) => t.taskId));

    // Update route polylines
    const routeSource = map.getSource('live-routes') as mapboxgl.GeoJSONSource | undefined;
    routeSource?.setData({
      type: 'FeatureCollection',
      features: validTasks
        .filter((t) => t.polyline.length >= 2)
        .map((t) => ({
          type: 'Feature' as const,
          geometry: { type: 'LineString' as const, coordinates: t.polyline },
          properties: { taskId: t.taskId, status: t.status },
        })),
    });

    // Remove markers whose tasks are gone
    agentMarkersRef.current.forEach(({ marker }, id) => {
      if (!validIds.has(id)) {
        marker.remove();
        agentMarkersRef.current.delete(id);
      }
    });
    destMarkersRef.current.forEach((marker, id) => {
      if (!validIds.has(id)) {
        marker.remove();
        destMarkersRef.current.delete(id);
      }
    });

    validTasks.forEach((t) => {
      const [lng, lat] = t.lastPosition;
      const stale = now - new Date(t.lastEventAt).getTime() > STALE_MS;
      const statusKey = `${t.status}_${stale}`;
      const existing = agentMarkersRef.current.get(t.taskId);

      if (existing) {
        // Position always updates in-place
        existing.marker.setLngLat([lng, lat]);
        // Rebuild element only when status or staleness changes
        if (existing.statusKey === statusKey) return;
        existing.marker.remove();
        agentMarkersRef.current.delete(t.taskId);
      }

      // Create agent pin
      const el = buildAgentEl(t, stale);
      if (!compact) {
        el.addEventListener('click', () => {
          setSelectedTaskId(t.taskId);
          mapRef.current?.flyTo({ center: [lng, lat], zoom: 14, speed: 1.2 });
        });
      }
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(map);
      agentMarkersRef.current.set(t.taskId, { marker, statusKey });

      // Destination pin (created once; destinations don't move)
      if (t.destination && !destMarkersRef.current.has(t.taskId)) {
        const destEl = document.createElement('div');
        destEl.style.cssText =
          'width:20px;height:20px;border-radius:50%;background:#9D4EDD;border:3px solid white;box-shadow:0 2px 8px rgba(157,78,221,0.4);';
        const destMarker = new mapboxgl.Marker({ element: destEl, anchor: 'center' })
          .setLngLat([t.destination.lng, t.destination.lat])
          .addTo(map);
        destMarkersRef.current.set(t.taskId, destMarker);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTasks, tick, compact, mapVersion]);

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
          Map requires NEXT_PUBLIC_MAPBOX_TOKEN
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center bg-dash-bg" style={{ height: 'calc(100vh - 64px)' }}>
        <div className="bg-white rounded-3xl p-10 shadow-lg max-w-md text-center space-y-4">
          <h2 className="text-xl font-bold text-dash-dark">Mapbox Token Required</h2>
          <div className="bg-gray-900 text-green-400 text-sm font-mono rounded-xl p-4 text-left">
            NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...
          </div>
          <p className="text-xs text-gray-400">Add to .env.local then restart the dev server.</p>
        </div>
      </div>
    );
  }

  if (compact) {
    return <div ref={mapContainer} className="w-full h-full" />;
  }

  return (
    <div className="relative w-full overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
      <WsConnector />

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
              className={`w-2 h-2 rounded-full ${
                wsConnected ? 'bg-green-500 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="text-[10px] text-gray-400">
              {wsConnected ? 'Live' : wsStatus === 'reconnecting' ? 'Reconnecting…' : 'Connecting'}
            </span>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-50">
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Radio size={24} className="text-gray-200" />
              <p className="text-[12px] text-gray-400">No agents currently tracked</p>
            </div>
          ) : (
            filteredTasks.map((task) => {
              const stale = isTaskStale(task.lastEventAt, nowMs);
              const color = getStatusColor(task.status, stale);
              const isSelected = selectedTaskId === task.taskId;
              return (
                <button
                  key={task.taskId}
                  onClick={() => setSelectedTaskId(task.taskId)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all ${
                    isSelected ? 'bg-dash-dark' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border-2 border-white shadow-sm bg-gray-100 flex items-center justify-center">
                    {task.agentAvatarUrl ? (
                      <img
                        src={task.agentAvatarUrl}
                        className="w-full h-full object-cover"
                        alt={task.agentName}
                      />
                    ) : (
                      <span className="text-[12px] font-bold text-gray-500">
                        {task.agentName
                          .split(' ')
                          .map((w) => w[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase() || '?'}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-[13px] font-bold truncate ${
                        isSelected ? 'text-white' : 'text-dash-dark'
                      }`}
                    >
                      {task.agentName || 'Agent'}
                    </p>
                    <p
                      className={`text-[11px] truncate mt-0.5 ${
                        isSelected ? 'text-white/50' : 'text-gray-400'
                      }`}
                    >
                      {task.taskAddress ?? task.taskTitle ?? `Task #${task.taskId}`}
                    </p>
                  </div>
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
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
                color: getStatusColor(
                  selectedTask.status,
                  isTaskStale(selectedTask.lastEventAt, nowMs)
                ),
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
            <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-gray-100 shadow-md bg-gray-100 flex items-center justify-center">
              {selectedTask.agentAvatarUrl ? (
                <img
                  src={selectedTask.agentAvatarUrl}
                  className="w-full h-full object-cover"
                  alt={selectedTask.agentName}
                />
              ) : (
                <span className="text-[22px] font-bold text-gray-400">
                  {selectedTask.agentName
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase() || '?'}
                </span>
              )}
            </div>
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
              className={`inline-block px-3.5 py-1.5 rounded-full text-[10px] font-bold mt-1 ${
                selectedTask.status === 'arrived'
                  ? 'bg-purple-50 text-purple-600'
                  : selectedTask.status === 'completed'
                  ? 'bg-green-50 text-green-600'
                  : 'bg-[#1A452C] text-[#4ADE80]'
              }`}
            >
              {selectedTask.status === 'arrived'
                ? 'Arrived'
                : selectedTask.status === 'completed'
                ? 'Completed'
                : 'On Field'}
            </div>
          </div>

          <button className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-100 rounded-2xl text-[12px] font-semibold text-gray-500 hover:bg-gray-50 transition-all">
            <MessageSquare size={14} />
            Send a message
          </button>
        </div>
      )}
    </div>
  );
}
