"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { format, parseISO } from "date-fns";
import { useEffectiveMapProvider } from "@/hooks/use-effective-map-provider";
import {
  createMapboxTransformRequest,
  getGoogleMapsPublicApiKey,
  getMapboxPublicToken,
} from "@/lib/config/public-env";
import { getCountryFallbackViewport } from "@/lib/map/default-viewport";
import { loadGoogleMapsApi } from "@/lib/map/google-loader";
import type { FieldStopDto, JourneyTimelineEvent } from "@/lib/api/field-activity";
import { escapeHtml } from "@/lib/tracking/field-trip-popups";

export const EVENT_COLORS: Record<string, string> = {
  green: "#22C55E",
  blue: "#3B82F6",
  orange: "#F97316",
  purple: "#A855F7",
  gray: "#9CA3AF",
  red: "#EF4444",
  teal: "#14B8A6",
};

export function formatJourneyDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function stopMarkerColor(classification: string | null | undefined): string {
  if (classification === "customer_visit" || classification === "lead_visit") return "#F97316";
  if (classification === "org_visit" || classification === "task") return "#3B82F6";
  if (classification === "meeting") return "#A855F7";
  if (classification === "personal") return "#14B8A6";
  if (classification === "ignore") return "#9CA3AF";
  return "#F97316";
}

export function formatStopWindow(arrivedAt: string | null, departedAt: string | null): string | null {
  if (!arrivedAt) return null;
  const start = format(parseISO(arrivedAt), "h:mm a");
  if (!departedAt) return `Arrived ${start}`;
  return `${start} – ${format(parseISO(departedAt), "h:mm a")}`;
}

function popupHtml(args: {
  title: string;
  address?: string | null;
  when?: string | null;
  duration?: string | null;
  detail?: string | null;
}): string {
  return `<div style="max-width:240px;padding:2px 0;font-family:system-ui,sans-serif">
    <div style="font-size:12px;font-weight:700;color:#0B1215">${escapeHtml(args.title)}</div>
    ${args.when ? `<div style="font-size:11px;color:#6B7280;margin-top:2px">${escapeHtml(args.when)}</div>` : ""}
    ${args.duration ? `<div style="font-size:11px;color:#6B7280">${escapeHtml(args.duration)}</div>` : ""}
    ${args.detail ? `<div style="font-size:11px;color:#6B7280;text-transform:capitalize">${escapeHtml(args.detail)}</div>` : ""}
    ${args.address !== undefined ? `<div style="font-size:11px;color:#0B1215;margin-top:4px">${escapeHtml(args.address || "Address unavailable")}</div>` : ""}
  </div>`;
}

type LngLatLiteral = { lat: number; lng: number };

/** One clickable point on the journey map (start/end, stop or timeline event). */
type MapPoint = {
  id: string;
  lng: number;
  lat: number;
  color: string;
  label: string;
  html: string;
  /** Numbered stop badge; otherwise a plain dot. */
  number?: number;
};

function buildPoints(args: {
  stops: FieldStopDto[];
  timeline: JourneyTimelineEvent[];
  start: { latitude: number; longitude: number } | null;
  end: { latitude: number; longitude: number } | null;
  isTrip: boolean;
}): MapPoint[] {
  const points: MapPoint[] = [];
  const startLabel = args.isTrip ? "Trip start" : "Clock in";
  const endLabel = args.isTrip ? "Trip end" : "Clock out";
  if (args.start) {
    points.push({
      id: "__start",
      lng: args.start.longitude,
      lat: args.start.latitude,
      color: "#22C55E",
      label: startLabel,
      html: popupHtml({ title: startLabel }),
    });
  }
  if (args.end) {
    points.push({
      id: "__end",
      lng: args.end.longitude,
      lat: args.end.latitude,
      color: "#EF4444",
      label: endLabel,
      html: popupHtml({ title: endLabel }),
    });
  }
  for (const event of args.timeline) {
    if (event.latitude == null || event.longitude == null) continue;
    if (event.type === "travel" || event.stop_id != null) continue;
    points.push({
      id: event.id,
      lng: event.longitude,
      lat: event.latitude,
      color: EVENT_COLORS[event.color] ?? "#9CA3AF",
      label: event.label,
      html: popupHtml({
        title: event.label,
        when: event.occurred_at ? format(parseISO(event.occurred_at), "h:mm a") : null,
        address: event.address ?? null,
      }),
    });
  }
  args.stops.forEach((stop, index) => {
    points.push({
      id: `stop_${stop.id}`,
      lng: stop.longitude,
      lat: stop.latitude,
      color: stopMarkerColor(stop.classification),
      label: `Stop ${index + 1}${stop.address ? `: ${stop.address}` : ""}`,
      number: index + 1,
      html: popupHtml({
        title: `Stop ${index + 1}`,
        address: stop.address,
        when: formatStopWindow(stop.arrived_at, stop.departed_at),
        duration: stop.duration_seconds > 0 ? formatJourneyDuration(stop.duration_seconds) : null,
        detail: (stop.classification ?? "pending").replaceAll("_", " "),
      }),
    });
  });
  return points;
}

function styleDot(el: HTMLElement, point: MapPoint, selected: boolean) {
  if (point.number != null) {
    const size = selected ? 30 : 24;
    el.style.cssText = [
      `width:${size}px`,
      `height:${size}px`,
      "border-radius:9999px",
      `background:${point.color}`,
      "color:white",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "font-size:11px",
      "font-weight:800",
      `border:${selected ? 3 : 2}px solid white`,
      `box-shadow:${selected ? "0 0 0 3px rgba(15,23,42,0.35)," : ""}0 2px 8px rgba(15,23,42,0.28)`,
      "cursor:pointer",
    ].join(";");
    el.textContent = String(point.number);
    return;
  }
  const size = selected ? 16 : 12;
  el.style.cssText = [
    `width:${size}px`,
    `height:${size}px`,
    "border-radius:9999px",
    `background:${point.color}`,
    "border:2px solid white",
    "box-shadow:0 1px 4px rgba(0,0,0,0.25)",
    "cursor:pointer",
  ].join(";");
}

type GoogleNs = {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => GoogleMapLike;
    Polyline: new (opts: Record<string, unknown>) => { setMap: (m: unknown) => void };
    Marker: new (opts: Record<string, unknown>) => GoogleMarkerLike;
    InfoWindow: new (opts?: Record<string, unknown>) => {
      setContent: (html: string) => void;
      setPosition: (p: LngLatLiteral) => void;
      open: (opts: unknown) => void;
      close: () => void;
    };
    LatLngBounds: new () => { extend: (pt: unknown) => void; isEmpty?: () => boolean };
    SymbolPath: { CIRCLE: number };
  };
};

type GoogleMapLike = {
  fitBounds: (b: unknown, padding?: unknown) => void;
  panTo: (p: LngLatLiteral) => void;
};

type GoogleMarkerLike = {
  setMap: (m: unknown) => void;
  setPosition: (p: LngLatLiteral) => void;
  setIcon: (icon: unknown) => void;
  setZIndex: (z: number) => void;
  addListener: (ev: string, fn: () => void) => void;
};

export type JourneyMapProps = {
  coordinates: [number, number][];
  timeline: JourneyTimelineEvent[];
  stops: FieldStopDto[];
  selectedId: string | null;
  onSelect?: (id: string) => void;
  /** Trip start/end (or clock-in/out for a clock-in day). */
  clockIn: { latitude: number; longitude: number } | null;
  clockOut: { latitude: number; longitude: number } | null;
  bounds: { min_lng: number; min_lat: number; max_lng: number; max_lat: number } | null;
  playbackIndex?: number | null;
  isTrip?: boolean;
  /** Fit the camera again only when this changes (not on every refetch). */
  fitKey?: string;
};

/**
 * Journey route map. The map instance is created once per provider; route,
 * markers, selection and playback are separate effects, so selecting a stop
 * or a live refetch never rebuilds the map.
 */
export function JourneyMap({
  coordinates,
  timeline,
  stops,
  selectedId,
  onSelect,
  clockIn,
  clockOut,
  bounds,
  playbackIndex = null,
  isTrip = false,
  fitKey = "",
}: JourneyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapboxRef = useRef<mapboxgl.Map | null>(null);
  const googleMapRef = useRef<GoogleMapLike | null>(null);
  const googleNsRef = useRef<GoogleNs | null>(null);
  const playbackMarkerRef = useRef<{ remove: () => void; move: (lng: number, lat: number) => void } | null>(null);
  const pointHandlesRef = useRef<
    Map<string, { point: MapPoint; setSelected: (selected: boolean) => void }>
  >(new Map());
  const clearDataRef = useRef<() => void>(() => {});
  const fittedKeyRef = useRef<string | null>(null);
  const openPopupRef = useRef<(point: MapPoint) => void>(() => {});
  const onSelectRef = useRef(onSelect);
  const [mapReady, setMapReady] = useState(0);

  const mapboxToken = useMemo(() => getMapboxPublicToken(), []);
  const googleApiKey = useMemo(() => getGoogleMapsPublicApiKey(), []);
  const { effectiveProvider } = useEffectiveMapProvider();
  const provider = effectiveProvider === "google" && googleApiKey ? "google" : "mapbox";

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const points = useMemo(
    () => buildPoints({ stops, timeline, start: clockIn, end: clockOut, isTrip }),
    [stops, timeline, clockIn, clockOut, isTrip],
  );

  // ── 1. Create the map (once per provider). ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    const fallback = getCountryFallbackViewport();
    fittedKeyRef.current = null;

    const disposeAll = () => {
      clearDataRef.current();
      clearDataRef.current = () => {};
      playbackMarkerRef.current?.remove();
      playbackMarkerRef.current = null;
      mapboxRef.current?.remove();
      mapboxRef.current = null;
      googleMapRef.current = null;
      googleNsRef.current = null;
      setMapReady(0);
    };

    if (provider === "google") {
      container.innerHTML = "";
      void loadGoogleMapsApi(googleApiKey).then((raw) => {
        if (cancelled || !raw) return;
        const google = raw as unknown as GoogleNs;
        googleNsRef.current = google;
        googleMapRef.current = new google.maps.Map(container, {
          center: { lat: fallback.center[1], lng: fallback.center[0] },
          zoom: 12,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
        });
        const info = new google.maps.InfoWindow({ maxWidth: 260 });
        openPopupRef.current = (point) => {
          info.setContent(point.html);
          info.setPosition({ lat: point.lat, lng: point.lng });
          info.open({ map: googleMapRef.current });
        };
        setMapReady((n) => n + 1);
      });
      return () => {
        cancelled = true;
        disposeAll();
      };
    }

    if (!mapboxToken) return;
    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
      container,
      style: "mapbox://styles/mapbox/light-v11",
      center: fallback.center,
      zoom: 11,
      transformRequest: createMapboxTransformRequest(),
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    mapboxRef.current = map;
    const popup = new mapboxgl.Popup({ offset: 14, maxWidth: "260px" });
    openPopupRef.current = (point) => {
      popup.setLngLat([point.lng, point.lat]).setHTML(point.html).addTo(map);
    };
    map.on("load", () => {
      if (!cancelled) setMapReady((n) => n + 1);
    });
    return () => {
      cancelled = true;
      popup.remove();
      disposeAll();
    };
  }, [provider, googleApiKey, mapboxToken]);

  // ── 2. Draw route + markers whenever the data changes. ──
  useEffect(() => {
    if (!mapReady) return;
    clearDataRef.current();
    pointHandlesRef.current.clear();

    if (provider === "google") {
      const google = googleNsRef.current;
      const map = googleMapRef.current;
      if (!google || !map) return;
      const owned: Array<{ setMap: (m: unknown) => void }> = [];
      if (coordinates.length > 1) {
        owned.push(
          new google.maps.Polyline({
            path: coordinates.map(([lng, lat]) => ({ lat, lng })),
            strokeColor: "#3B82F6",
            strokeOpacity: 0.85,
            strokeWeight: 4,
            map,
          }),
        );
      }
      const iconFor = (point: MapPoint, selected: boolean) => ({
        path: google.maps.SymbolPath.CIRCLE,
        scale: point.number != null ? (selected ? 12 : 10) : selected ? 8 : 6,
        fillColor: point.color,
        fillOpacity: 1,
        strokeColor: selected ? "#0B1215" : "#ffffff",
        strokeWeight: selected ? 3 : 2,
      });
      for (const point of points) {
        const marker = new google.maps.Marker({
          position: { lat: point.lat, lng: point.lng },
          map,
          title: point.label,
          icon: iconFor(point, false),
          label:
            point.number != null
              ? { text: String(point.number), color: "#ffffff", fontSize: "10px", fontWeight: "800" }
              : undefined,
        });
        marker.addListener("click", () => {
          onSelectRef.current?.(point.id);
          openPopupRef.current(point);
        });
        owned.push(marker);
        pointHandlesRef.current.set(point.id, {
          point,
          setSelected: (selected) => {
            marker.setIcon(iconFor(point, selected));
            marker.setZIndex(selected ? 100 : 10);
          },
        });
      }
      clearDataRef.current = () => owned.forEach((item) => item.setMap(null));

      if (fittedKeyRef.current !== fitKey) {
        const gBounds = new google.maps.LatLngBounds();
        let any = false;
        coordinates.forEach(([lng, lat]) => {
          gBounds.extend({ lat, lng });
          any = true;
        });
        points.forEach((p) => {
          gBounds.extend({ lat: p.lat, lng: p.lng });
          any = true;
        });
        if (bounds) {
          gBounds.extend({ lat: bounds.min_lat, lng: bounds.min_lng });
          gBounds.extend({ lat: bounds.max_lat, lng: bounds.max_lng });
          any = true;
        }
        if (any) {
          map.fitBounds(gBounds, 48);
          fittedKeyRef.current = fitKey;
        }
      }
      return;
    }

    const map = mapboxRef.current;
    if (!map) return;
    const routeData = {
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates: coordinates.length > 1 ? coordinates : [] },
    };
    const source = map.getSource("journey-route") as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData(routeData);
    } else {
      map.addSource("journey-route", { type: "geojson", data: routeData });
      map.addLayer({
        id: "journey-route-line",
        type: "line",
        source: "journey-route",
        paint: { "line-color": "#3B82F6", "line-width": 4, "line-opacity": 0.85 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
    }

    const markers: mapboxgl.Marker[] = [];
    for (const point of points) {
      const el = document.createElement("div");
      styleDot(el, point, false);
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", point.label);
      const activate = (event: Event) => {
        event.stopPropagation();
        onSelectRef.current?.(point.id);
        openPopupRef.current(point);
      };
      el.addEventListener("click", activate);
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate(event);
        }
      });
      const marker = new mapboxgl.Marker({ element: el }).setLngLat([point.lng, point.lat]).addTo(map);
      markers.push(marker);
      pointHandlesRef.current.set(point.id, {
        point,
        setSelected: (selected) => {
          styleDot(el, point, selected);
          el.style.zIndex = selected ? "10" : "";
        },
      });
    }
    clearDataRef.current = () => markers.forEach((m) => m.remove());

    if (fittedKeyRef.current !== fitKey) {
      const lngs = [...coordinates.map((c) => c[0]), ...points.map((p) => p.lng)];
      const lats = [...coordinates.map((c) => c[1]), ...points.map((p) => p.lat)];
      if (bounds) {
        lngs.push(bounds.min_lng, bounds.max_lng);
        lats.push(bounds.min_lat, bounds.max_lat);
      }
      if (lngs.length > 0) {
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 56, maxZoom: 15, duration: 0 },
        );
        fittedKeyRef.current = fitKey;
      }
    }
  }, [mapReady, provider, coordinates, points, bounds, fitKey]);

  // ── 3. Selection: highlight, pan to it and open its popup. ──
  const lastSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    const handles = pointHandlesRef.current;
    const previous = lastSelectedRef.current;
    if (previous && previous !== selectedId) handles.get(previous)?.setSelected(false);
    lastSelectedRef.current = selectedId;
    if (!selectedId) return;
    const handle = handles.get(selectedId);
    if (!handle) return;
    handle.setSelected(true);
    const { lng, lat } = handle.point;
    if (provider === "google") {
      googleMapRef.current?.panTo({ lat, lng });
    } else {
      mapboxRef.current?.easeTo({ center: [lng, lat], duration: 500 });
    }
    openPopupRef.current(handle.point);
    // Re-run after markers are redrawn so the highlight survives a refetch.
  }, [selectedId, mapReady, points, provider]);

  // ── 4. Playback marker, both providers, without remounting the map. ──
  useEffect(() => {
    if (playbackIndex == null || coordinates.length === 0 || !mapReady) {
      playbackMarkerRef.current?.remove();
      playbackMarkerRef.current = null;
      return;
    }
    const idx = Math.min(Math.max(playbackIndex, 0), coordinates.length - 1);
    const [lng, lat] = coordinates[idx];

    if (!playbackMarkerRef.current) {
      if (provider === "google") {
        const google = googleNsRef.current;
        const map = googleMapRef.current;
        if (!google || !map) return;
        const marker = new google.maps.Marker({
          position: { lat, lng },
          map,
          zIndex: 200,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#0EA5E9",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 3,
          },
        });
        playbackMarkerRef.current = {
          remove: () => marker.setMap(null),
          move: (x, y) => marker.setPosition({ lat: y, lng: x }),
        };
      } else {
        const map = mapboxRef.current;
        if (!map) return;
        const el = document.createElement("div");
        el.style.cssText =
          "width:18px;height:18px;border-radius:9999px;background:#0EA5E9;border:3px solid white;box-shadow:0 2px 8px rgba(14,165,233,0.55);";
        const marker = new mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(map);
        playbackMarkerRef.current = {
          remove: () => marker.remove(),
          move: (x, y) => marker.setLngLat([x, y]),
        };
      }
      return;
    }
    playbackMarkerRef.current.move(lng, lat);
  }, [coordinates, provider, playbackIndex, mapReady]);

  return <div ref={containerRef} className="h-full w-full rounded-2xl overflow-hidden bg-[#e8ecef]" />;
}
