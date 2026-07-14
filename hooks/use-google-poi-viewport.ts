"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type mapboxgl from "mapbox-gl";
import type { PoiResult } from "@/lib/map/overpass-search";
import {
  canFetchPoisForViewport,
  fetchPlacesInViewport,
  type ViewportBounds,
} from "@/lib/map/poi-viewport";

const DEBOUNCE_MS = 700;

function readViewportBounds(map: mapboxgl.Map): ViewportBounds | null {
  const bounds = map.getBounds();
  if (!bounds) return null;
  return {
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth(),
  };
}

export function useGooglePoiViewport(
  map: mapboxgl.Map | null,
  mapReady: boolean,
  enabled: boolean,
) {
  const [pois, setPois] = useState<PoiResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<PoiResult | null>(null);
  const [zoomTooLow, setZoomTooLow] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!map || !mapReady || !enabled) {
      setPois([]);
      setBusy(false);
      setZoomTooLow(false);
      return;
    }

    const bounds = readViewportBounds(map);
    const zoom = map.getZoom();
    if (!bounds) return;

    if (!canFetchPoisForViewport(zoom, bounds)) {
      abortRef.current?.abort();
      abortRef.current = null;
      setPois([]);
      setBusy(false);
      setZoomTooLow(zoom < 12);
      setError(null);
      return;
    }

    setZoomTooLow(false);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setBusy(true);
    setError(null);

    try {
      const results = await fetchPlacesInViewport(bounds, zoom, controller.signal);
      if (controller.signal.aborted) return;
      setPois(results);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Failed to load places");
      setPois([]);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }, [enabled, map, mapReady]);

  useEffect(() => {
    if (!map || !mapReady || !enabled) {
      setPois([]);
      setBusy(false);
      setZoomTooLow(false);
      return;
    }

    const scheduleRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void refresh();
      }, DEBOUNCE_MS);
    };

    scheduleRefresh();
    map.on("moveend", scheduleRefresh);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      map.off("moveend", scheduleRefresh);
      abortRef.current?.abort();
    };
  }, [enabled, map, mapReady, refresh]);

  const selectPoi = useCallback((poi: PoiResult | null) => {
    setSelectedPoi(poi);
  }, []);

  return {
    pois,
    busy,
    error,
    zoomTooLow,
    selectedPoi,
    setSelectedPoi: selectPoi,
    refresh,
  };
}
