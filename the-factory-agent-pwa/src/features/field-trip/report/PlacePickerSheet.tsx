'use client';

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { ArrowLeft, Loader2, LocateFixed, MapPin } from 'lucide-react';
import { env } from '@/constants/env';
import { createMapboxTransformRequest, getMapboxPublicToken } from '@/lib/map/public-env';
import { getAgentMapboxStyle } from '@/lib/map/style-mode';
import { reverseGeocode } from '@/lib/map/reverseGeocode';
import { OverlayPortal } from '@/components/shared/OverlayPortal';
import { PlaceAutocompleteField } from '@/features/locations/components/PlaceAutocompleteField';

export interface PickedPlace {
  latitude: number;
  longitude: number;
  address: string | null;
}

/**
 * Choose the right place for a stop: move the map under the pin or search for
 * a place. The detected spot stays visible (grey) so the change is clear.
 */
export function PlacePickerSheet({
  title = 'Choose the right place',
  initial,
  detected,
  route,
  onClose,
  onPick,
}: {
  title?: string;
  initial: PickedPlace;
  /** Where the system detected the stop (shown grey). */
  detected?: { latitude: number; longitude: number } | null;
  /** The trip's route, to help find a missed stop. */
  route?: [number, number][];
  onClose: () => void;
  onPick: (place: PickedPlace) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number }>({ lat: initial.latitude, lng: initial.longitude });
  const [address, setAddress] = useState<string | null>(initial.address);
  const [resolving, setResolving] = useState(false);
  const [search, setSearch] = useState('');
  const [failed, setFailed] = useState(false);
  const lookupSeq = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const token = getMapboxPublicToken() || env.MAPBOX_TOKEN;
    if (!token) {
      setTimeout(() => setFailed(true), 0);
      return undefined;
    }
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: getAgentMapboxStyle(),
      center: [initial.longitude, initial.latitude],
      zoom: 17,
      attributionControl: false,
      transformRequest: createMapboxTransformRequest(),
    });
    mapRef.current = map;
    const markers: mapboxgl.Marker[] = [];
    if (detected) {
      const el = document.createElement('div');
      el.style.cssText = 'width:14px;height:14px;border-radius:9999px;background:#9CA3AF;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)';
      el.title = 'Detected here';
      markers.push(new mapboxgl.Marker({ element: el }).setLngLat([detected.longitude, detected.latitude]).addTo(map));
    }
    map.on('load', () => {
      if (route && route.length > 1) {
        map.addSource('pick-route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route } } });
        map.addLayer({ id: 'pick-route', type: 'line', source: 'pick-route', paint: { 'line-color': '#EA580C', 'line-width': 4, 'line-opacity': 0.8 } });
      }
    });
    map.on('moveend', () => {
      const c = map.getCenter();
      setCenter({ lat: c.lat, lng: c.lng });
    });
    return () => {
      markers.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
    // Built once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Address of the spot under the pin (debounced by moveend).
  useEffect(() => {
    if (center.lat === initial.latitude && center.lng === initial.longitude) return undefined;
    const seq = ++lookupSeq.current;
    const t = setTimeout(() => {
      setResolving(true);
      void reverseGeocode(center.lng, center.lat)
        .then((a) => {
          if (seq === lookupSeq.current) setAddress(a);
        })
        .finally(() => {
          if (seq === lookupSeq.current) setResolving(false);
        });
    }, 350);
    return () => clearTimeout(t);
  }, [center, initial.latitude, initial.longitude]);

  const flyTo = (lat: number, lng: number) => mapRef.current?.flyTo({ center: [lng, lat], zoom: 17, duration: 600 });

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-[10060] flex flex-col bg-[#0A1D25] text-white" role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center gap-2 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+10px)]">
          <button type="button" onClick={onClose} aria-label="Back" className="flex h-11 w-11 items-center justify-center rounded-full active:bg-white/10">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-[16px] font-semibold">{title}</h2>
        </div>
        <div className="px-3 pb-2">
          <PlaceAutocompleteField
            value={search}
            onChange={setSearch}
            variant="dark"
            placeholder="Search a place or address"
            proximity={[center.lng, center.lat]}
            onPlaceSelect={(p) => {
              setAddress(p.address || p.name);
              flyTo(p.lat, p.lng);
            }}
          />
        </div>
        <div className="relative flex-1">
          {failed ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[#8F9098]">
              The map could not load. Search for the place above instead.
            </div>
          ) : (
            <div ref={containerRef} className="absolute inset-0" />
          )}
          {/* Fixed pin: move the map under it. */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full text-[#F59E0B]">
            <MapPin size={40} fill="#F59E0B" stroke="#fff" strokeWidth={1.5} />
          </div>
          <button
            type="button"
            onClick={() => flyTo(initial.latitude, initial.longitude)}
            className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#0E2A36] shadow-lg"
            aria-label="Back to the detected place"
          >
            <LocateFixed size={18} />
          </button>
        </div>
        <div className="space-y-2 bg-[#0E2A36] px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
          <p className="text-[11px] text-white/60">Move the map so the pin sits on the right place.</p>
          <p className="min-h-[20px] text-[13px] font-medium">
            {resolving ? <Loader2 size={14} className="inline animate-spin" /> : address || `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`}
          </p>
          <button
            type="button"
            onClick={() => onPick({ latitude: center.lat, longitude: center.lng, address })}
            className="h-12 w-full rounded-2xl bg-[#44AFCD] text-[14px] font-semibold text-[#0A1D25] active:scale-[0.98]"
          >
            Use this place
          </button>
        </div>
      </div>
    </OverlayPortal>
  );
}
