'use client';

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Pause, Play } from 'lucide-react';
import { env } from '@/constants/env';
import { createMapboxTransformRequest, getMapboxPublicToken } from '@/lib/map/public-env';
import { getAgentMapboxStyle } from '@/lib/map/style-mode';
import { coordinatesOf, playbackIndex, type JourneyRouteDto, type JourneyStopDto } from '../journeyDetail';

const SOURCE = 'trip-route';
const PLAY_SECONDS = 20;

function pin(color: string, label?: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = `width:${label ? 22 : 16}px;height:${label ? 22 : 16}px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font:700 11px system-ui`;
  if (label) el.textContent = label;
  return el;
}

/**
 * The trip on a map: route line, green start, red end, numbered stops and a
 * simple playback (play / scrub) along the recorded route.
 */
export function TripRouteMap({
  route,
  stops,
  running = false,
}: {
  route: JourneyRouteDto | null | undefined;
  stops: JourneyStopDto[];
  /** Trip still in progress: the end pin is "current position" (orange). */
  running?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const playMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  const progressRef = useRef(1);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);
  const coords = route?.coordinates ?? [];

  // Build the map once per route.
  useEffect(() => {
    if (!containerRef.current || coords.length === 0) return undefined;
    const token = getMapboxPublicToken() || env.MAPBOX_TOKEN;
    if (!token) {
      setTimeout(() => setFailed(true), 0);
      return undefined;
    }
    let map: mapboxgl.Map;
    try {
      mapboxgl.accessToken = token;
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: getAgentMapboxStyle(),
        center: coords[0],
        zoom: 14,
        attributionControl: false,
        transformRequest: createMapboxTransformRequest(),
      });
    } catch {
      setTimeout(() => setFailed(true), 0);
      return undefined;
    }
    mapRef.current = map;
    const markers: mapboxgl.Marker[] = [];

    map.on('load', () => {
      map.addSource(SOURCE, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } },
      });
      map.addLayer({
        id: `${SOURCE}-casing`,
        type: 'line',
        source: SOURCE,
        paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.addLayer({
        id: `${SOURCE}-line`,
        type: 'line',
        source: SOURCE,
        paint: { 'line-color': '#EA580C', 'line-width': 4 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      markers.push(new mapboxgl.Marker({ element: pin('#10B981') }).setLngLat(coords[0]).addTo(map));
      const last = coords[coords.length - 1];
      if (coords.length > 1 && last) {
        markers.push(new mapboxgl.Marker({ element: pin(running ? '#F97316' : '#EF4444') }).setLngLat(last).addTo(map));
      }
      stops.forEach((stop, i) => {
        const at = coordinatesOf(stop);
        if (!at) return;
        const marker = new mapboxgl.Marker({ element: pin('#F59E0B', String(i + 1)) }).setLngLat(at);
        if (stop.address) marker.setPopup(new mapboxgl.Popup({ offset: 14, closeButton: false }).setText(stop.address));
        markers.push(marker.addTo(map));
      });

      const bounds = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]));
      map.fitBounds(bounds, { padding: 36, maxZoom: 16, duration: 0 });
    });
    map.on('error', () => {
      // Tile errors are recoverable; only a map that never loads shows the fallback.
      if (!map.loaded()) setFailed(true);
    });

    return () => {
      markers.forEach((m) => m.remove());
      playMarkerRef.current?.remove();
      playMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // coords identity changes only when the route changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, stops, running]);

  // Playback marker follows the scrubber.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !route || coords.length === 0) return;
    const i = playbackIndex(route, progress);
    const at = coords[i];
    if (!at) return;
    if (progress >= 1 && !playing) {
      playMarkerRef.current?.remove();
      playMarkerRef.current = null;
      return;
    }
    if (!playMarkerRef.current) playMarkerRef.current = new mapboxgl.Marker({ element: pin('#2563EB') });
    playMarkerRef.current.setLngLat(at).addTo(map);
  }, [progress, playing, route, coords]);

  // Play: run the whole trip in PLAY_SECONDS.
  useEffect(() => {
    if (!playing) return undefined;
    let frame = 0;
    let last = performance.now();
    let at = progressRef.current;
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      at = Math.min(1, at + dt / PLAY_SECONDS);
      setProgress(at);
      if (at >= 1) {
        setPlaying(false); // reached the end of the trip
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  if (coords.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-6 text-center text-xs text-[#8F9098]">
        No route was recorded for this trip.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
      {failed ? (
        <div className="flex h-56 items-center justify-center px-6 text-center text-xs text-[#8F9098]">
          The map could not load. Check your connection and open this trip again.
        </div>
      ) : (
        <div ref={containerRef} className="h-64 w-full" aria-label="Trip route map" role="img" />
      )}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={() => {
            if (!playing && progress >= 1) setProgress(0);
            setPlaying((p) => !p);
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#44AFCD] text-[#0A1D25]"
          aria-label={playing ? 'Pause playback' : 'Play the trip'}
        >
          {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          onChange={(e) => {
            setPlaying(false);
            setProgress(Number(e.target.value) / 1000);
          }}
          className="h-11 flex-1 accent-[#44AFCD]"
          aria-label="Trip playback position"
        />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 pb-3 text-[11px] text-[#8F9098]">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#10B981]" /> Start</span>
        <span className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${running ? 'bg-[#F97316]' : 'bg-[#EF4444]'}`} /> {running ? 'Now' : 'End'}
        </span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]" /> Stops</span>
      </div>
    </div>
  );
}
