'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { X, MapPin, Route, CheckCircle2, Navigation } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { getActiveCompanyContext } from '@/lib/company-context';
import { createMapboxTransformRequest, getMapboxPublicToken } from '@/lib/config/public-env';
import { useTaskRoute } from '@/hooks/use-tracking';

const MAPBOX_TOKEN = getMapboxPublicToken();

function RouteMap({
  polyline,
  start,
  arrival,
  destination,
}: {
  polyline: [number, number][];
  start: { lat: number; lng: number } | null;
  arrival: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const center: [number, number] =
      polyline.length > 0
        ? polyline[Math.floor(polyline.length / 2)]
        : start
          ? [start.lng, start.lat]
          : [3.36, 6.595];

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center,
      zoom: 13,
      attributionControl: false,
      transformRequest: createMapboxTransformRequest(),
    });
    mapRef.current = map;

    map.on('load', () => {
      // Route polyline
      if (polyline.length >= 2) {
        map.addSource('route-history', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: polyline },
            properties: {},
          },
        });
        map.addLayer({
          id: 'route-history-line',
          type: 'line',
          source: 'route-history',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#3B82F6', 'line-width': 3, 'line-opacity': 0.8 },
        });

        // Fit map to route bounds
        const bounds = polyline.reduce(
          (b, pt) => b.extend(pt as mapboxgl.LngLatLike),
          new mapboxgl.LngLatBounds(polyline[0], polyline[0])
        );
        map.fitBounds(bounds, { padding: 40, maxZoom: 15 });
      }

      // Start marker (green)
      if (start) {
        const el = document.createElement('div');
        el.style.cssText =
          'width:14px;height:14px;border-radius:50%;background:#10B981;border:2.5px solid white;box-shadow:0 2px 6px rgba(16,185,129,0.5);';
        new mapboxgl.Marker({ element: el }).setLngLat([start.lng, start.lat]).addTo(map);
      }

      // Arrival marker (purple)
      if (arrival) {
        const el = document.createElement('div');
        el.style.cssText =
          'width:14px;height:14px;border-radius:50%;background:#8B5CF6;border:2.5px solid white;box-shadow:0 2px 6px rgba(139,92,246,0.5);';
        new mapboxgl.Marker({ element: el }).setLngLat([arrival.lng, arrival.lat]).addTo(map);
      }

      // Destination marker
      if (destination) {
        const el = document.createElement('div');
        el.style.cssText =
          'width:16px;height:16px;border-radius:50%;background:#9D4EDD;border:3px solid white;box-shadow:0 2px 8px rgba(157,78,221,0.4);';
        new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([destination.lng, destination.lat])
          .addTo(map);
      }
    });

    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
}

interface RouteHistoryPanelProps {
  taskId: number;
  taskTitle: string;
  onClose: () => void;
}

function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return 'In progress';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function RouteHistoryPanel({ taskId, taskTitle, onClose }: RouteHistoryPanelProps) {
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);

  const routeRole: 'agent' | 'management' =
    role && ['owner', 'admin', 'management', 'manager', 'supervisor'].includes(role.toLowerCase())
      ? 'management'
      : 'agent';

  const { data: route, isLoading, isError } = useTaskRoute(taskId, {
    company_id: companyId ?? 0,
    role: routeRole,
  });

  const polyline = (route?.polyline ?? []) as [number, number][];
  const start = route?.start
    ? { lat: route.start.latitude, lng: route.start.longitude }
    : null;
  const arrival = route?.arrival
    ? { lat: route.arrival.latitude, lng: route.arrival.longitude }
    : null;
  const destination = route?.destination
    ? { lat: route.destination.latitude, lng: route.destination.longitude }
    : null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-bold text-dash-dark truncate">{taskTitle}</h3>
          <p className="text-[11px] text-gray-400">Route history</p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-all shrink-0"
        >
          <X size={15} />
        </button>
      </div>

      {/* Map */}
      <div className="h-56 shrink-0 bg-gray-100 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-dash-teal border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!isLoading && route && (
          <RouteMap
            polyline={polyline}
            start={start}
            arrival={arrival}
            destination={destination}
          />
        )}
        {isError && (
          <div className="absolute inset-0 flex items-center justify-center text-[12px] text-gray-400">
            Failed to load route
          </div>
        )}
      </div>

      {/* Stats */}
      {route && (
        <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 shrink-0">
          <div className="px-4 py-3 text-center">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Points</p>
            <p className="text-[15px] font-bold text-dash-dark mt-0.5">
              {route.summary?.points_count ?? polyline.length}
            </p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Distance</p>
            <p className="text-[15px] font-bold text-dash-dark mt-0.5">
              {route.summary?.total_distance_meters != null
                ? route.summary.total_distance_meters >= 1000
                  ? `${(route.summary.total_distance_meters / 1000).toFixed(1)}km`
                  : `${Math.round(route.summary.total_distance_meters)}m`
                : '—'}
            </p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Duration</p>
            <p className="text-[15px] font-bold text-dash-dark mt-0.5">
              {route.start
                ? formatDuration(route.start.recorded_at, route.end?.recorded_at ?? null)
                : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-gray-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {route && (
          <>
            {/* Start event */}
            {route.start && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-green-50 flex items-center justify-center shrink-0 mt-0.5">
                  <Navigation size={14} className="text-green-500" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-dash-dark">Task started</p>
                  <p className="text-[11px] text-gray-400">{formatTime(route.start.recorded_at)}</p>
                </div>
              </div>
            )}

            {/* Arrival event */}
            {route.arrival && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin size={14} className="text-purple-500" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-dash-dark">Arrived at destination</p>
                  <p className="text-[11px] text-gray-400">{formatTime(route.arrival.recorded_at)}</p>
                </div>
              </div>
            )}

            {/* Completion event */}
            {route.end && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-teal-50 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 size={14} className="text-dash-teal" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-dash-dark">Task completed</p>
                  <p className="text-[11px] text-gray-400">{formatTime(route.end.recorded_at)}</p>
                </div>
              </div>
            )}

            {/* In-progress status */}
            {!route.end && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                  <Route size={14} className="text-blue-500" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-dash-dark">Currently tracking</p>
                  <p className="text-[11px] text-gray-400">Agent is en route</p>
                </div>
              </div>
            )}

            {/* Map legend */}
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Legend</p>
              <div className="flex items-center gap-2 text-[12px] text-gray-500">
                <span className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
                Start point
              </div>
              <div className="flex items-center gap-2 text-[12px] text-gray-500">
                <span className="w-3 h-3 rounded-full bg-purple-500 shrink-0" />
                Arrival point
              </div>
              <div className="flex items-center gap-2 text-[12px] text-gray-500">
                <span className="w-3 h-3 rounded-full bg-[#9D4EDD] shrink-0" />
                Destination
              </div>
              <div className="flex items-center gap-2 text-[12px] text-gray-500">
                <span className="w-8 h-0.5 bg-blue-500 shrink-0 rounded-full" />
                Travel route
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
