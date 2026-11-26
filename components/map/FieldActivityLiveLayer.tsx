"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import {
  liveAgentDistanceMeters,
  useFieldActivityLiveStore,
  type FieldActivityLiveAgent,
} from "@/store/field-activity-live";
import type { GoogleMapBridge } from "@/components/map/SavedLocationsLayer";
import {
  agentTrailColor,
  animateMarkerMove,
  createLiveAgentMarkerElement,
  type LngLat,
} from "@/lib/map/agent-trail";
import { createGoogleHtmlMarker, type GoogleHtmlMarker } from "@/lib/map/google-html-marker";
import { resolveFieldTripLiveState } from "@/lib/tracking/field-trip-live";
import {
  buildFieldTripAgentPopupHtml,
  buildFieldTripStopPopupHtml,
} from "@/lib/tracking/field-trip-popups";

type GooglePolyline = {
  setMap: (map: unknown) => void;
  setPath: (path: Array<{ lat: number; lng: number }>) => void;
  setOptions: (options: Record<string, unknown>) => void;
};

type GoogleMarker = {
  setMap: (map: unknown) => void;
  setPosition: (pos: { lat: number; lng: number }) => void;
  addListener: (event: string, handler: () => void) => unknown;
};

type GoogleInfoWindow = {
  setContent: (html: string) => void;
  setPosition: (pos: { lat: number; lng: number }) => void;
  open: (options: { map: unknown }) => void;
  close: () => void;
};

type GoogleMapsNs = {
  Polyline: new (options: Record<string, unknown>) => GooglePolyline;
  Marker: new (options: Record<string, unknown>) => GoogleMarker;
  InfoWindow: new (options?: Record<string, unknown>) => GoogleInfoWindow;
  OverlayView: new () => unknown;
  LatLng: new (lat: number, lng: number) => unknown;
  SymbolPath: { CIRCLE: unknown };
};

export type FieldActivityLiveLayerProps = {
  provider: "mapbox" | "google";
  ready: boolean;
  /** The person being followed/highlighted (drawn on top, thicker line). */
  selectedUserId: number | null;
  /** Avatar click: select/follow that person. */
  onSelectUserId?: (userId: number) => void;
  /** Base path for "View journey" links, e.g. "/operations/journeys". */
  journeyHrefBase?: string | null;
  getMapboxMap?: () => mapboxgl.Map | null;
  getGoogleMap?: () => GoogleMapBridge | null;
};

const SOURCE_ID = "field-activity-live-routes";
const LINE_LAYER_ID = "field-activity-live-routes-line";
const CASING_LAYER_ID = `${LINE_LAYER_ID}-casing`;
const STOPS_SOURCE_ID = "field-activity-live-stops";
const STOPS_LAYER_ID = "field-activity-live-stops-circle";

/** Glide duration for live position updates (points arrive every ~30-60s). */
const MOVE_ANIMATION_MS = 1800;
/** Re-evaluate "Signal lost" styling even when no point arrives. */
const STALE_TICK_MS = 30_000;

type MapboxLiveMarker = {
  marker: mapboxgl.Marker;
  update: ReturnType<typeof createLiveAgentMarkerElement>["update"];
  position: LngLat;
  cancelAnimation: (() => void) | null;
};

type GoogleLiveMarker = {
  marker: GoogleHtmlMarker;
  update: ReturnType<typeof createLiveAgentMarkerElement>["update"];
  position: LngLat;
  cancelAnimation: (() => void) | null;
};

function startPointOf(agent: FieldActivityLiveAgent): [number, number] | null {
  return agent.startPosition ?? agent.polyline[0] ?? null;
}

export function FieldActivityLiveLayer({
  provider,
  ready,
  selectedUserId,
  onSelectUserId,
  journeyHrefBase = "/operations/journeys",
  getMapboxMap,
  getGoogleMap,
}: FieldActivityLiveLayerProps) {
  // This layer owns its store subscription so a new point re-renders only the
  // layer, not the whole map page.
  const agentsMap = useFieldActivityLiveStore((s) => s.agents);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const googlePolylinesRef = useRef<Map<number, GooglePolyline>>(new Map());
  const googleStopMarkersRef = useRef<Map<string, GoogleMarker>>(new Map());
  const mapboxLiveMarkersRef = useRef<Map<number, MapboxLiveMarker>>(new Map());
  const googleLiveMarkersRef = useRef<Map<number, GoogleLiveMarker>>(new Map());
  const mapboxPopupRef = useRef<mapboxgl.Popup | null>(null);
  const googleInfoRef = useRef<GoogleInfoWindow | null>(null);

  // Latest values for event handlers and the unmount cleanup, so neither has
  // to depend on (possibly inline) getter props.
  const getMapboxMapRef = useRef(getMapboxMap);
  const getGoogleMapRef = useRef(getGoogleMap);
  const onSelectRef = useRef(onSelectUserId);
  const agentsRef = useRef(agentsMap);
  const journeyBaseRef = useRef(journeyHrefBase);
  useEffect(() => {
    getMapboxMapRef.current = getMapboxMap;
    getGoogleMapRef.current = getGoogleMap;
    onSelectRef.current = onSelectUserId;
    agentsRef.current = agentsMap;
    journeyBaseRef.current = journeyHrefBase;
  });

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), STALE_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const agentPopupHtml = (userId: number): string | null => {
    const agent = agentsRef.current[userId];
    if (!agent) return null;
    const now = Date.now();
    const base = journeyBaseRef.current;
    return buildFieldTripAgentPopupHtml({
      name: agent.name,
      state: resolveFieldTripLiveState(agent, now),
      startedAt: agent.startedAt,
      endedAt: agent.endedAt,
      lastRecordedAt: agent.lastRecordedAt,
      distanceMeters: liveAgentDistanceMeters(agent),
      stopCount: agent.stops.length,
      nowMs: now,
      journeyHref: base && agent.sessionId > 0 ? `${base}/${agent.sessionId}` : null,
    });
  };

  const stopPopupHtml = (userId: number, stopId: number, kind: "start" | "stop"): string => {
    const agent = agentsRef.current[userId];
    const stop = kind === "stop" ? agent?.stops.find((s) => s.id === stopId) : undefined;
    return buildFieldTripStopPopupHtml({
      kind,
      agentName: agent?.name ?? null,
      label: stop?.address ?? null,
      classification: stop?.classification ?? null,
      arrivedAt: kind === "start" ? agent?.startedAt ?? null : stop?.arrived_at ?? null,
      durationSeconds: stop?.duration_seconds ?? null,
      recordStatus: stop?.record_status ?? null,
      outcome: stop?.outcome ?? null,
    });
  };

  // ── Draw / update everything when the data changes. ──
  useEffect(() => {
    if (!ready) return;
    const visible = Object.values(agentsMap);

    if (provider === "mapbox") {
      const map = getMapboxMapRef.current?.();
      if (!map) return;

      const routeFeatures = visible
        .filter((a) => a.polyline.length >= 2)
        .map((a) => {
          const state = resolveFieldTripLiveState(a, nowMs);
          return {
            type: "Feature" as const,
            properties: {
              userId: a.userId,
              selected: selectedUserId === a.userId,
              muted: state === "ended" || state === "signal_lost",
              color: state === "ended" ? "#94A3B8" : agentTrailColor(a.userId),
            },
            geometry: { type: "LineString" as const, coordinates: a.polyline },
          };
        });

      const stopFeatures = visible.flatMap((a) => {
        const start = startPointOf(a);
        const startFeature = start
          ? [{
              type: "Feature" as const,
              properties: { userId: a.userId, stopId: 0, kind: "start" },
              geometry: { type: "Point" as const, coordinates: start },
            }]
          : [];
        return [
          ...startFeature,
          ...a.stops.map((stop) => ({
            type: "Feature" as const,
            properties: { userId: a.userId, stopId: stop.id, kind: "stop" },
            geometry: {
              type: "Point" as const,
              coordinates: [stop.longitude, stop.latitude] as [number, number],
            },
          })),
        ];
      });

      const routeSource = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (!routeSource) {
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: routeFeatures },
        });
      } else {
        routeSource.setData({ type: "FeatureCollection", features: routeFeatures });
      }
      if (!map.getLayer(CASING_LAYER_ID)) {
        map.addLayer({
          id: CASING_LAYER_ID,
          type: "line",
          source: SOURCE_ID,
          paint: {
            "line-color": "#ffffff",
            "line-width": ["case", ["==", ["get", "selected"], true], 9, 7],
            "line-opacity": 0.9,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
      }
      if (!map.getLayer(LINE_LAYER_ID)) {
        map.addLayer({
          id: LINE_LAYER_ID,
          type: "line",
          source: SOURCE_ID,
          paint: {
            // Each person's trail uses their color (matches their moving avatar).
            "line-color": ["get", "color"],
            "line-width": ["case", ["==", ["get", "selected"], true], 5, 3.5],
            "line-opacity": [
              "case",
              ["==", ["get", "muted"], true],
              0.45,
              ["==", ["get", "selected"], true],
              0.95,
              0.75,
            ],
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
      }

      const stopsSource = map.getSource(STOPS_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (!stopsSource) {
        map.addSource(STOPS_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: stopFeatures },
        });
      } else {
        stopsSource.setData({ type: "FeatureCollection", features: stopFeatures });
      }
      if (!map.getLayer(STOPS_LAYER_ID)) {
        map.addLayer({
          id: STOPS_LAYER_ID,
          type: "circle",
          source: STOPS_SOURCE_ID,
          paint: {
            "circle-radius": ["case", ["==", ["get", "kind"], "start"], 8, 7],
            "circle-color": ["case", ["==", ["get", "kind"], "start"], "#10B981", "#F59E0B"],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
      }

      // Moving live-position avatars — one per person, animated between updates.
      const keepLive = new Set<number>();
      for (const agent of visible) {
        if (!agent.lastPosition) continue;
        keepLive.add(agent.userId);

        const state = resolveFieldTripLiveState(agent, nowMs);
        const options = {
          agentName: agent.name,
          avatarUrl: agent.avatarUrl,
          color: agentTrailColor(agent.userId),
          selected: selectedUserId === agent.userId,
          muted: state === "ended" || state === "signal_lost",
        };
        const target = agent.lastPosition;
        let entry = mapboxLiveMarkersRef.current.get(agent.userId);

        if (!entry) {
          const { element, update } = createLiveAgentMarkerElement(options);
          const userId = agent.userId;
          element.title = agent.name;
          element.addEventListener("click", (event) => {
            event.stopPropagation();
            onSelectRef.current?.(userId);
            const html = agentPopupHtml(userId);
            const current = mapboxLiveMarkersRef.current.get(userId);
            if (!html || !current) return;
            mapboxPopupRef.current?.remove();
            mapboxPopupRef.current = new mapboxgl.Popup({ offset: 24, maxWidth: "280px" })
              .setLngLat(current.position)
              .setHTML(html)
              .addTo(map);
          });
          const marker = new mapboxgl.Marker({ element, anchor: "center" })
            .setLngLat(target)
            .addTo(map);
          entry = { marker, update, position: target, cancelAnimation: null };
          mapboxLiveMarkersRef.current.set(agent.userId, entry);
        } else {
          entry.update(options);
          if (entry.position[0] !== target[0] || entry.position[1] !== target[1]) {
            entry.cancelAnimation?.();
            const current = entry;
            current.cancelAnimation = animateMarkerMove(current.position, target, MOVE_ANIMATION_MS, (pos) => {
              current.marker.setLngLat(pos);
              current.position = pos;
            });
          }
        }
      }
      mapboxLiveMarkersRef.current.forEach((entry, userId) => {
        if (!keepLive.has(userId)) {
          entry.cancelAnimation?.();
          entry.marker.remove();
          mapboxLiveMarkersRef.current.delete(userId);
        }
      });
      return;
    }

    // ── Google ──
    const bridge = getGoogleMapRef.current?.();
    const gmap = bridge?.map;
    const googleMaps =
      ((bridge?.maps as unknown as { maps?: GoogleMapsNs } | undefined)?.maps) ??
      (typeof window !== "undefined"
        ? (window as unknown as { google?: { maps?: GoogleMapsNs } }).google?.maps
        : undefined);
    if (!gmap || !googleMaps) return;

    const info = (googleInfoRef.current ??= new googleMaps.InfoWindow({ maxWidth: 280 }));
    const openInfo = (html: string | null, position: { lat: number; lng: number }) => {
      if (!html) return;
      info.setContent(html);
      info.setPosition(position);
      info.open({ map: gmap });
    };

    const keepPolyline = new Set<number>();
    for (const agent of visible) {
      if (agent.polyline.length < 2) continue;
      keepPolyline.add(agent.userId);
      const state = resolveFieldTripLiveState(agent, nowMs);
      const muted = state === "ended" || state === "signal_lost";
      const isSelected = selectedUserId === agent.userId;
      const style = {
        strokeColor: state === "ended" ? "#94A3B8" : agentTrailColor(agent.userId),
        strokeOpacity: muted ? 0.45 : isSelected ? 0.95 : 0.75,
        strokeWeight: isSelected ? 5 : 3.5,
        zIndex: isSelected ? 30 : 10,
      };
      const path = agent.polyline.map(([lng, lat]) => ({ lat, lng }));
      const line = googlePolylinesRef.current.get(agent.userId);
      if (!line) {
        googlePolylinesRef.current.set(
          agent.userId,
          new googleMaps.Polyline({ path, geodesic: true, map: gmap, ...style }),
        );
      } else {
        line.setPath(path);
        line.setOptions(style);
      }
    }
    googlePolylinesRef.current.forEach((line, userId) => {
      if (!keepPolyline.has(userId)) {
        line.setMap(null);
        googlePolylinesRef.current.delete(userId);
      }
    });

    // Moving avatars: DOM overlay so real profile photos show (like Mapbox).
    const keepLive = new Set<number>();
    for (const agent of visible) {
      if (!agent.lastPosition) continue;
      keepLive.add(agent.userId);
      const state = resolveFieldTripLiveState(agent, nowMs);
      const isSelected = selectedUserId === agent.userId;
      const options = {
        agentName: agent.name,
        avatarUrl: agent.avatarUrl,
        color: agentTrailColor(agent.userId),
        selected: isSelected,
        muted: state === "ended" || state === "signal_lost",
      };
      const target = agent.lastPosition;
      let entry = googleLiveMarkersRef.current.get(agent.userId);

      if (!entry) {
        const { element, update } = createLiveAgentMarkerElement(options);
        const userId = agent.userId;
        element.title = agent.name;
        const marker = createGoogleHtmlMarker(
          googleMaps as unknown as Parameters<typeof createGoogleHtmlMarker>[0],
          {
            map: gmap,
            position: { lat: target[1], lng: target[0] },
            element,
            zIndex: isSelected ? 40 : 20,
          },
        );
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          onSelectRef.current?.(userId);
          const current = googleLiveMarkersRef.current.get(userId);
          if (!current) return;
          openInfo(agentPopupHtml(userId), { lat: current.position[1], lng: current.position[0] });
        });
        entry = { marker, update, position: target, cancelAnimation: null };
        googleLiveMarkersRef.current.set(agent.userId, entry);
      } else {
        entry.update(options);
        entry.marker.setZIndex(isSelected ? 40 : 20);
        if (entry.position[0] !== target[0] || entry.position[1] !== target[1]) {
          entry.cancelAnimation?.();
          const current = entry;
          current.cancelAnimation = animateMarkerMove(current.position, target, MOVE_ANIMATION_MS, (pos) => {
            current.marker.setPosition({ lat: pos[1], lng: pos[0] });
            current.position = pos;
          });
        }
      }
    }
    googleLiveMarkersRef.current.forEach((entry, userId) => {
      if (!keepLive.has(userId)) {
        entry.cancelAnimation?.();
        entry.marker.setMap(null);
        googleLiveMarkersRef.current.delete(userId);
      }
    });

    const keepStops = new Set<string>();
    const upsertPin = (
      key: string,
      position: { lat: number; lng: number },
      title: string,
      fillColor: string,
      scale: number,
      onClick: () => void,
    ) => {
      keepStops.add(key);
      const existing = googleStopMarkersRef.current.get(key);
      if (existing) {
        existing.setPosition(position);
        return;
      }
      const marker = new googleMaps.Marker({
        position,
        map: gmap,
        title,
        icon: {
          path: googleMaps.SymbolPath.CIRCLE,
          scale,
          fillColor,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      marker.addListener("click", onClick);
      googleStopMarkersRef.current.set(key, marker);
    };

    for (const agent of visible) {
      const userId = agent.userId;
      const start = startPointOf(agent);
      if (start) {
        const position = { lat: start[1], lng: start[0] };
        upsertPin(`${userId}:start`, position, "Trip start", "#10B981", 8, () =>
          openInfo(stopPopupHtml(userId, 0, "start"), position),
        );
      }
      for (const stop of agent.stops) {
        const position = { lat: stop.latitude, lng: stop.longitude };
        const stopId = stop.id;
        upsertPin(`${userId}:${stopId}`, position, stop.address ?? "Stop", "#F59E0B", 7, () =>
          openInfo(stopPopupHtml(userId, stopId, "stop"), position),
        );
      }
    }
    googleStopMarkersRef.current.forEach((marker, key) => {
      if (!keepStops.has(key)) {
        marker.setMap(null);
        googleStopMarkersRef.current.delete(key);
      }
    });
    // Handlers above read refs only; the getters are read through refs too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, ready, agentsMap, selectedUserId, nowMs]);

  // ── Mapbox: click handling for start/stop pins. Declared after the draw
  // effect so the stops layer already exists when the handlers bind. ──
  useEffect(() => {
    if (!ready || provider !== "mapbox") return;
    const map = getMapboxMapRef.current?.();
    if (!map) return;

    const onClick = (event: mapboxgl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      const props = feature.properties ?? {};
      const coords = feature.geometry.coordinates as [number, number];
      const kind = props.kind === "start" ? "start" : "stop";
      mapboxPopupRef.current?.remove();
      mapboxPopupRef.current = new mapboxgl.Popup({ offset: 12, maxWidth: "280px" })
        .setLngLat(coords)
        .setHTML(stopPopupHtml(Number(props.userId), Number(props.stopId), kind))
        .addTo(map);
    };
    const onEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = "";
    };
    map.on("click", STOPS_LAYER_ID, onClick);
    map.on("mouseenter", STOPS_LAYER_ID, onEnter);
    map.on("mouseleave", STOPS_LAYER_ID, onLeave);
    return () => {
      map.off("click", STOPS_LAYER_ID, onClick);
      map.off("mouseenter", STOPS_LAYER_ID, onEnter);
      map.off("mouseleave", STOPS_LAYER_ID, onLeave);
    };
    // stopPopupHtml reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, provider]);

  // Tear everything down only when the layer unmounts (not on every render).
  useEffect(() => {
    const polylines = googlePolylinesRef.current;
    const stopMarkers = googleStopMarkersRef.current;
    const googleLive = googleLiveMarkersRef.current;
    const mapboxLive = mapboxLiveMarkersRef.current;
    return () => {
      polylines.forEach((line) => line.setMap(null));
      polylines.clear();
      stopMarkers.forEach((marker) => marker.setMap(null));
      stopMarkers.clear();
      googleLive.forEach((entry) => {
        entry.cancelAnimation?.();
        entry.marker.setMap(null);
      });
      googleLive.clear();
      googleInfoRef.current?.close();
      mapboxLive.forEach((entry) => {
        entry.cancelAnimation?.();
        entry.marker.remove();
      });
      mapboxLive.clear();
      mapboxPopupRef.current?.remove();

      const map = getMapboxMapRef.current?.();
      if (!map) return;
      try {
        // Layers first (casing too), then the sources they use.
        for (const layerId of [LINE_LAYER_ID, CASING_LAYER_ID, STOPS_LAYER_ID]) {
          if (map.getLayer(layerId)) map.removeLayer(layerId);
        }
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        if (map.getSource(STOPS_SOURCE_ID)) map.removeSource(STOPS_SOURCE_ID);
      } catch {
        // Map already destroyed (page navigation): nothing left to clean.
      }
    };
  }, []);

  return null;
}
