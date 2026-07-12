"use client";

import { useCallback, useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { PoiResult } from "@/lib/map/overpass-search";

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
  const id = `poi-pin-${color.replace("#", "")}`;
  if (map.hasImage(id)) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image(28, 38);
    img.onload = () => {
      if (!map.hasImage(id)) map.addImage(id, img);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildPinSvg(color))}`;
  });
}

type Props = {
  map: mapboxgl.Map | null;
  mapReady: boolean;
  pois: PoiResult[];
  visible: boolean;
  selectedPoiId?: string | null;
  onPoiClick: (poi: PoiResult) => void;
};

export function GooglePoiMapLayer({
  map,
  mapReady,
  pois,
  visible,
  selectedPoiId,
  onPoiClick,
}: Props) {
  const poiByIdRef = useRef<Map<string, PoiResult>>(new Map());
  const tooltipRef = useRef<mapboxgl.Popup | null>(null);

  useEffect(() => {
    poiByIdRef.current = new Map(pois.map((poi) => [poi.id, poi]));
  }, [pois]);

  const handleEnter = useCallback(
    (e: mapboxgl.MapLayerMouseEvent) => {
      if (!map) return;
      map.getCanvas().style.cursor = "pointer";
      const feat = e.features?.[0];
      if (!feat) return;
      const coords = (feat.geometry as { type: string; coordinates: number[] })
        .coordinates as [number, number];
      const p = feat.properties as Record<string, string>;
      tooltipRef.current?.remove();
      tooltipRef.current = new mapboxgl.Popup({
        offset: [0, -40],
        closeButton: false,
        closeOnClick: false,
        anchor: "bottom",
        className: "poi-tooltip",
      })
        .setLngLat(coords)
        .setHTML(
          '<div style="padding:8px 10px;min-width:150px;max-width:230px;font-family:ui-sans-serif,system-ui,sans-serif">' +
            `<p style="font-weight:700;font-size:13px;color:#0f172a;margin:0;line-height:1.35">${p.name ?? ""}</p>` +
            `<p style="font-size:11px;color:${p.color ?? "#64748b"};margin:3px 0 0;font-weight:600">${p.category ?? ""}</p>` +
            (p.address
              ? `<p style="font-size:11px;color:#64748b;margin:4px 0 0;line-height:1.4">${p.address}</p>`
              : "") +
            (p.phone
              ? `<p style="font-size:10px;color:#94a3b8;margin:3px 0 0">📞 ${p.phone}</p>`
              : "") +
            "</div>",
        )
        .addTo(map);
    },
    [map],
  );

  const handleLeave = useCallback(() => {
    if (map) map.getCanvas().style.cursor = "";
    tooltipRef.current?.remove();
    tooltipRef.current = null;
  }, [map]);

  const handleClick = useCallback(
    (e: mapboxgl.MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat) return;
      const id = (feat.properties as { id?: string }).id;
      if (!id) return;
      const poi = poiByIdRef.current.get(id);
      if (poi) onPoiClick(poi);
    },
    [onPoiClick],
  );

  useEffect(() => {
    let active = true;

    const cleanup = () => {
      tooltipRef.current?.remove();
      tooltipRef.current = null;
      if (!map) return;
      try {
        map.off("mouseenter", "poi-pins", handleEnter);
        map.off("mouseleave", "poi-pins", handleLeave);
        map.off("click", "poi-pins", handleClick);
        if (map.getLayer("poi-pins")) map.removeLayer("poi-pins");
        if (map.getSource("poi-data")) map.removeSource("poi-data");
      } catch {
        /* map may have been destroyed */
      }
    };

    cleanup();

    if (!map || !mapReady || !visible || pois.length === 0) {
      return cleanup;
    }

    (async () => {
      const uniqueColors = [...new Set(pois.map((p) => p.categoryColor))];
      await Promise.all(uniqueColors.map((c) => loadPinImage(map, c)));
      if (!active) return;

      map.addSource("poi-data", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: pois.map((poi) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [poi.lng, poi.lat] },
            properties: {
              id: poi.id,
              name: poi.name,
              category: poi.categoryLabel,
              color: poi.categoryColor,
              address: poi.address ?? "",
              phone: poi.phone ?? "",
              openingHours: poi.openingHours ?? "",
              selected: selectedPoiId === poi.id ? "1" : "0",
            },
          })),
        },
      });

      map.addLayer({
        id: "poi-pins",
        type: "symbol",
        source: "poi-data",
        layout: {
          "icon-image": ["concat", "poi-pin-", ["slice", ["get", "color"], 1]],
          "icon-size": ["case", ["==", ["get", "selected"], "1"], 1.2, 1],
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });

      map.on("mouseenter", "poi-pins", handleEnter);
      map.on("mouseleave", "poi-pins", handleLeave);
      map.on("click", "poi-pins", handleClick);
    })();

    return () => {
      active = false;
      cleanup();
    };
  }, [
    map,
    mapReady,
    visible,
    pois,
    selectedPoiId,
    handleEnter,
    handleLeave,
    handleClick,
  ]);

  return null;
}
