'use client';

import dynamic from 'next/dynamic';

// Mapbox GL JS uses browser-only APIs and dynamic imports internally.
// ssr:false prevents Turbopack from bundling it during the server pass.
const MapView = dynamic(
  () => import('@/components/map/map-view').then((m) => m.MapView),
  { ssr: false, loading: () => <div style={{ height: 'calc(100vh - 64px)' }} className="bg-[#e8ecef] animate-pulse" /> }
);

export default function MapPage() {
  return <MapView />;
}
