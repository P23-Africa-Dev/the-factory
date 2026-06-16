'use client';

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { env } from '@/constants/env';

// Set mapbox token safely
if (typeof window !== 'undefined') {
  mapboxgl.accessToken = env.MAPBOX_TOKEN;
}

export type MapboxMapProps = {
  agentPosition: [number, number] | null; // [lng, lat]
  destinationPosition: [number, number] | null; // [lng, lat]
  polylineCoords: [number, number][]; // [lng, lat][]
  radiusMeters: number | null;
  arrived: boolean;
  dimmed?: boolean;
};

export function MapboxMap({
  agentPosition,
  destinationPosition,
  polylineCoords,
  radiusMeters,
  arrived,
  dimmed = false,
}: MapboxMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const agentMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [mapError, setMapError] = useState(false);

  // Fallback map view if Mapbox fails
  const fallbackView = (
    <div className="absolute inset-0 bg-[#0A1D25] flex items-center justify-center overflow-hidden">
      <img
        src="/assets/default-map-bg.png"
        alt="Map fallback"
        className="w-full h-full object-cover opacity-60"
      />
    </div>
  );

  // Initialize Map
  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current || mapRef.current) return;

    try {
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: agentPosition || destinationPosition || [8.6753, 9.0820], // Default centered on Nigeria
        zoom: 14,
        attributionControl: false,
      });

      map.on('error', (e) => {
        console.warn('Mapbox error:', e);
        setMapError(true);
      });

      map.on('load', () => {
        // Add source and layers for polyline route
        map.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: polylineCoords.length > 0 ? polylineCoords : [[0, 0]],
            },
          },
        });

        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#75ADAF',
            'line-width': 4,
            'line-opacity': 0.8,
          },
        });

        // Add source and layers for geofence radius
        if (destinationPosition && radiusMeters != null) {
          map.addSource('geofence', {
            type: 'geojson',
            data: getCirclePolygon(destinationPosition, radiusMeters),
          });

          map.addLayer({
            id: 'geofence-fill',
            type: 'fill',
            source: 'geofence',
            paint: {
              'fill-color': arrived ? '#7BB6B8' : '#FD6046',
              'fill-opacity': 0.15,
            },
          });

          map.addLayer({
            id: 'geofence-outline',
            type: 'line',
            source: 'geofence',
            paint: {
              'line-color': arrived ? '#7BB6B8' : '#FD6046',
              'line-width': 1.5,
              'line-opacity': 0.6,
            },
          });
        }
      });

      mapRef.current = map;
    } catch (err) {
      console.warn('Failed to initialize Mapbox:', err);
      setMapError(true);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update dynamic properties
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Wait until map style is loaded
    if (!map.isStyleLoaded()) return;

    // 1. Update Route Polyline
    const routeSource = map.getSource('route') as mapboxgl.GeoJSONSource | undefined;
    if (routeSource) {
      routeSource.setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: polylineCoords.length > 1 ? polylineCoords : [[0, 0]],
        },
      });
    }

    // 2. Update Geofence Radius Circle
    const geofenceSource = map.getSource('geofence') as mapboxgl.GeoJSONSource | undefined;
    if (destinationPosition && radiusMeters != null) {
      const circleGeoJSON = getCirclePolygon(destinationPosition, radiusMeters);
      if (geofenceSource) {
        geofenceSource.setData(circleGeoJSON);
      } else {
        // If loaded but not added, add it dynamically
        try {
          map.addSource('geofence', {
            type: 'geojson',
            data: circleGeoJSON,
          });

          map.addLayer({
            id: 'geofence-fill',
            type: 'fill',
            source: 'geofence',
            paint: {
              'fill-color': arrived ? '#7BB6B8' : '#FD6046',
              'fill-opacity': 0.15,
            },
          });

          map.addLayer({
            id: 'geofence-outline',
            type: 'line',
            source: 'geofence',
            paint: {
              'line-color': arrived ? '#7BB6B8' : '#FD6046',
              'line-width': 1.5,
              'line-opacity': 0.6,
            },
          });
        } catch {}
      }

      // Update color based on arrival status
      if (map.getLayer('geofence-fill')) {
        map.setPaintProperty('geofence-fill', 'fill-color', arrived ? '#7BB6B8' : '#FD6046');
      }
      if (map.getLayer('geofence-outline')) {
        map.setPaintProperty('geofence-outline', 'line-color', arrived ? '#7BB6B8' : '#FD6046');
      }
    }

    // 3. Update Agent Marker
    if (agentPosition) {
      if (agentMarkerRef.current) {
        agentMarkerRef.current.setLngLat(agentPosition);
      } else {
        const el = document.createElement('div');
        el.className = 'w-5 h-5 rounded-full bg-[#4A90E2] border-[3px] border-white shadow-md transition-all duration-300';
        agentMarkerRef.current = new mapboxgl.Marker(el)
          .setLngLat(agentPosition)
          .addTo(map);
      }

      // Smoothly ease map camera to agent coordinates
      map.easeTo({
        center: agentPosition,
        zoom: 15,
        duration: 800,
      });
    } else if (agentMarkerRef.current) {
      agentMarkerRef.current.remove();
      agentMarkerRef.current = null;
    }

    // 4. Update Destination Pin
    if (destinationPosition) {
      if (destMarkerRef.current) {
        destMarkerRef.current.setLngLat(destinationPosition);
      } else {
        const el = document.createElement('div');
        el.className = 'w-4.5 h-4.5 rounded-full bg-[#FD6046] border-[3px] border-white shadow-md';
        destMarkerRef.current = new mapboxgl.Marker(el)
          .setLngLat(destinationPosition)
          .addTo(map);
      }
    } else if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }
  }, [agentPosition, destinationPosition, polylineCoords, radiusMeters, arrived]);

  // Generate GeoJSON Polygon coordinates for a circular geofence
  function getCirclePolygon(center: [number, number], radiusInMeters: number): GeoJSON.Feature<GeoJSON.Polygon> {
    const coords = {
      latitude: center[1],
      longitude: center[0],
    };
    const km = radiusInMeters / 1000;
    const ret = [];
    const distanceX = km / (111.32 * Math.cos((coords.latitude * Math.PI) / 180));
    const distanceY = km / 110.574;

    const points = 64;
    for (let i = 0; i < points; i++) {
      const theta = (i / points) * (2 * Math.PI);
      const x = distanceX * Math.cos(theta);
      const y = distanceY * Math.sin(theta);
      ret.push([coords.longitude + x, coords.latitude + y]);
    }
    ret.push(ret[0]); // Close polygon
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [ret],
      },
    };
  }

  if (mapError) {
    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center">
        {fallbackView}
        {dimmed && <div className="absolute inset-0 bg-black/45 pointer-events-none" />}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />
      {dimmed && <div className="absolute inset-0 bg-black/45 pointer-events-none" />}
    </div>
  );
}

export default React.memo(MapboxMap);
