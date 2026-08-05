"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { FieldActivityLiveAgent } from "@/store/field-activity-live";
import type { GoogleMapBridge } from "@/components/map/SavedLocationsLayer";

type GooglePolyline = {
  setMap: (map: unknown) => void;
  setPath: (path: Array<{ lat: number; lng: number }>) => void;
};

type GoogleMarker = {
  setMap: (map: unknown) => void;
  setPosition: (pos: { lat: number; lng: number }) => void;
};

export type FieldActivityLiveLayerProps = {
  provider: "mapbox" | "google";
  ready: boolean;
  agents: FieldActivityLiveAgent[];
  selectedUserId: number | null;
  followAll: boolean;
  getMapboxMap?: () => mapboxgl.Map | null;
  getGoogleMap?: () => GoogleMapBridge | null;
};

const SOURCE_ID = "field-activity-live-routes";
const LINE_LAYER_ID = "field-activity-live-routes-line";
const STOPS_SOURCE_ID = "field-activity-live-stops";
const STOPS_LAYER_ID = "field-activity-live-stops-circle";

function visibleAgents(
  agents: FieldActivityLiveAgent[],
  selectedUserId: number | null,
  followAll: boolean,
): FieldActivityLiveAgent[] {
  if (followAll) return agents;
  if (selectedUserId != null) {
    return agents.filter((a) => a.userId === selectedUserId);
  }
  // Default: show trails for all active field agents when on clocked-in context
  return agents;
}

export function FieldActivityLiveLayer({
  provider,
  ready,
  agents,
  selectedUserId,
  followAll,
  getMapboxMap,
  getGoogleMap,
}: FieldActivityLiveLayerProps) {
  const googlePolylinesRef = useRef<Map<number, GooglePolyline>>(new Map());
  const googleStopMarkersRef = useRef<Map<string, GoogleMarker>>(new Map());

  useEffect(() => {
    if (!ready) return;
    const visible = visibleAgents(agents, selectedUserId, followAll);

    if (provider === "mapbox") {
      const map = getMapboxMap?.();
      if (!map) return;

      const routeFeatures = visible
        .filter((a) => a.polyline.length >= 2)
        .map((a) => ({
          type: "Feature" as const,
          properties: {
            userId: a.userId,
            selected: selectedUserId === a.userId,
          },
          geometry: {
            type: "LineString" as const,
            coordinates: a.polyline,
          },
        }));

      const stopFeatures = visible.flatMap((a) =>
        a.stops.map((stop) => ({
          type: "Feature" as const,
          properties: {
            userId: a.userId,
            stopId: stop.id,
            classification: stop.classification ?? "pending",
            label: stop.address ?? "Stop",
          },
          geometry: {
            type: "Point" as const,
            coordinates: [stop.longitude, stop.latitude] as [number, number],
          },
        })),
      );

      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: routeFeatures },
        });
        map.addLayer({
          id: LINE_LAYER_ID,
          type: "line",
          source: SOURCE_ID,
          paint: {
            "line-color": [
              "case",
              ["==", ["get", "selected"], true],
              "#2F5E71",
              "#75ADAF",
            ],
            "line-width": [
              "case",
              ["==", ["get", "selected"], true],
              4.5,
              3,
            ],
            "line-opacity": 0.9,
          },
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
        });
      } else {
        const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource;
        source.setData({ type: "FeatureCollection", features: routeFeatures });
      }

      if (!map.getSource(STOPS_SOURCE_ID)) {
        map.addSource(STOPS_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: stopFeatures },
        });
        map.addLayer({
          id: STOPS_LAYER_ID,
          type: "circle",
          source: STOPS_SOURCE_ID,
          paint: {
            "circle-radius": 7,
            "circle-color": "#F59E0B",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
      } else {
        const source = map.getSource(STOPS_SOURCE_ID) as mapboxgl.GeoJSONSource;
        source.setData({ type: "FeatureCollection", features: stopFeatures });
      }

      return;
    }

    const gmap = getGoogleMap?.();
    if (!gmap || typeof window === "undefined" || !(window as unknown as { google?: typeof google }).google) {
      return;
    }
    const googleMaps = (window as unknown as { google: typeof google }).google.maps;

    const keepPolyline = new Set<number>();
    for (const agent of visible) {
      if (agent.polyline.length < 2) continue;
      keepPolyline.add(agent.userId);
      const path = agent.polyline.map(([lng, lat]) => ({ lat, lng }));
      let line = googlePolylinesRef.current.get(agent.userId);
      if (!line) {
        line = new googleMaps.Polyline({
          path,
          geodesic: true,
          strokeColor: selectedUserId === agent.userId ? "#2F5E71" : "#75ADAF",
          strokeOpacity: 0.9,
          strokeWeight: selectedUserId === agent.userId ? 4.5 : 3,
          map: gmap as unknown as google.maps.Map,
        }) as unknown as GooglePolyline;
        googlePolylinesRef.current.set(agent.userId, line);
      } else {
        line.setPath(path);
        line.setMap(gmap);
      }
    }
    googlePolylinesRef.current.forEach((line, userId) => {
      if (!keepPolyline.has(userId)) {
        line.setMap(null);
        googlePolylinesRef.current.delete(userId);
      }
    });

    const keepStops = new Set<string>();
    for (const agent of visible) {
      for (const stop of agent.stops) {
        const key = `${agent.userId}:${stop.id}`;
        keepStops.add(key);
        let marker = googleStopMarkersRef.current.get(key);
        const position = { lat: stop.latitude, lng: stop.longitude };
        if (!marker) {
          marker = new googleMaps.Marker({
            position,
            map: gmap as unknown as google.maps.Map,
            title: stop.address ?? "Stop",
            icon: {
              path: googleMaps.SymbolPath.CIRCLE,
              scale: 7,
              fillColor: "#F59E0B",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            },
          }) as unknown as GoogleMarker;
          googleStopMarkersRef.current.set(key, marker);
        } else {
          marker.setPosition(position);
          marker.setMap(gmap);
        }
      }
    }
    googleStopMarkersRef.current.forEach((marker, key) => {
      if (!keepStops.has(key)) {
        marker.setMap(null);
        googleStopMarkersRef.current.delete(key);
      }
    });
  }, [provider, ready, agents, selectedUserId, followAll, getMapboxMap, getGoogleMap]);

  useEffect(() => {
    return () => {
      googlePolylinesRef.current.forEach((line) => line.setMap(null));
      googlePolylinesRef.current.clear();
      googleStopMarkersRef.current.forEach((marker) => marker.setMap(null));
      googleStopMarkersRef.current.clear();

      const map = getMapboxMap?.();
      if (map) {
        if (map.getLayer(LINE_LAYER_ID)) map.removeLayer(LINE_LAYER_ID);
        if (map.getLayer(STOPS_LAYER_ID)) map.removeLayer(STOPS_LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        if (map.getSource(STOPS_SOURCE_ID)) map.removeSource(STOPS_SOURCE_ID);
      }
    };
  }, [getMapboxMap]);

  return null;
}
