'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { Search, MoreHorizontal, RefreshCw, MessageSquare, X } from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  avatar: string;
  status: 'active' | 'idle';
  zone: string;
}

const INITIAL_AGENTS: Agent[] = [
  { id: '1', name: 'Lane Wade', address: '28, Akinlusi way..', lat: 6.6018, lng: 3.3515, avatar: '/avatars/female-avatar.png', status: 'active', zone: 'Ikeja LGA' },
  { id: '2', name: 'Lane Wade', address: '28, Akinlusi way..', lat: 6.5841, lng: 3.3705, avatar: '/avatars/female-avatar.png', status: 'idle',   zone: 'Agege LGA' },
  { id: '3', name: 'Lane Wade', address: '28, Akinlusi way..', lat: 6.5622, lng: 3.3210, avatar: '/avatars/female-avatar.png', status: 'idle',   zone: 'Alimosho LGA' },
  { id: '4', name: 'Lane Wade', address: '28, Akinlusi way..', lat: 6.6205, lng: 3.3850, avatar: '/avatars/female-avatar.png', status: 'idle',   zone: 'Kosofe LGA' },
  { id: '5', name: 'Lane Wade', address: '28, Akinlusi way..', lat: 6.5980, lng: 3.3120, avatar: '/avatars/female-avatar.png', status: 'active', zone: 'Ikeja LGA' },
];

const ROUTE_COORDS: [number, number][] = [
  [3.3515, 6.6018], [3.3600, 6.5950], [3.3650, 6.5850],
  [3.3705, 6.5841], [3.3720, 6.5760], [3.3730, 6.5700], [3.3850, 6.6205],
];

function jitter() { return (Math.random() - 0.5) * 0.0008; }

function createMarkerEl(agent: Agent): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;user-select:none;';
  el.innerHTML = `
    <svg width="30" height="36" viewBox="0 0 30 36" fill="none">
      <path d="M15 0C6.716 0 0 6.716 0 15c0 9.941 13.5 21 15 21S30 24.941 30 15C30 6.716 23.284 0 15 0z" fill="#EF4444"/>
      <circle cx="15" cy="14" r="6" fill="white"/>
    </svg>
    <div style="background:white;border-radius:20px;padding:3px 8px 3px 4px;display:flex;align-items:center;gap:5px;box-shadow:0 2px 8px rgba(0,0,0,0.15);margin-top:4px;white-space:nowrap;">
      <img src="${agent.avatar}" style="width:22px;height:22px;border-radius:50%;object-fit:cover;border:1.5px solid #e5e7eb;"/>
      <div style="line-height:1.2;">
        <div style="font-size:10px;font-weight:700;color:#0B1215;">${agent.name}</div>
        <div style="font-size:8px;color:#9ca3af;">Active at Kemsi Street</div>
      </div>
    </div>
  `;
  return el;
}

interface MapViewProps {
  compact?: boolean;
}

export function MapView({ compact = false }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<mapboxgl.Map | null>(null);
  const markersRef   = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const agentsRef    = useRef<Agent[]>(INITIAL_AGENTS);

  const [agents, setAgents]               = useState<Agent[]>(INITIAL_AGENTS);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [searchQuery, setSearchQuery]     = useState('');
  const [mapReady, setMapReady]           = useState(false);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !token) return;

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [3.3600, 6.5950],
      zoom: compact ? 11.5 : 12.5,
      attributionControl: false,
      ...(compact && { interactive: false }),
    });

    mapRef.current = map;

    map.on('load', () => {
      if (!compact) {
        // Route line
        map.addSource('route', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ROUTE_COORDS } },
        });
        map.addLayer({
          id: 'route-line', type: 'line', source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#3B82F6', 'line-width': 10, 'line-opacity': 0.9 },
        });

        // Destination pulse
        const destEl = document.createElement('div');
        destEl.innerHTML = `
          <style>.dest-pulse{animation:destpulse 2s infinite}@keyframes destpulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.2);opacity:.7}}</style>
          <div class="dest-pulse" style="width:44px;height:44px;border-radius:50%;background:rgba(199,119,255,0.15);border:5px solid rgba(199,119,255,0.4);display:flex;align-items:center;justify-content:center;">
            <div style="width:14px;height:14px;border-radius:50%;background:#9D4EDD;border:2px solid white;"></div>
          </div>
        `;
        new mapboxgl.Marker({ element: destEl, anchor: 'center' }).setLngLat([3.4050, 6.6300]).addTo(map);

        // Navigation arrow
        const navEl = document.createElement('div');
        navEl.innerHTML = `
          <div style="width:34px;height:34px;border-radius:50%;background:#3B82F6;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(59,130,246,0.5);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
          </div>
        `;
        new mapboxgl.Marker({ element: navEl, anchor: 'center' }).setLngLat([3.3750, 6.5760]).addTo(map);
      }

      // Agent markers
      agentsRef.current.forEach((agent) => {
        const el = createMarkerEl(agent);
        if (!compact) el.addEventListener('click', () => setSelectedAgent(agent));
        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([agent.lng, agent.lat])
          .addTo(map);
        markersRef.current.set(agent.id, marker);
      });

      setMapReady(true);
    });

    return () => { map.remove(); mapRef.current = null; };
  }, [token, compact]);

  // ── Animate agents ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || compact) return;
    const interval = setInterval(() => {
      setAgents((prev) => {
        const next = prev.map((a) => ({ ...a, lat: a.lat + jitter(), lng: a.lng + jitter() }));
        agentsRef.current = next;
        next.forEach((a) => markersRef.current.get(a.id)?.setLngLat([a.lng, a.lat]));
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [mapReady]);

  // ── Fly to agent ────────────────────────────────────────────────────────────
  const handleAgentClick = useCallback((agent: Agent) => {
    setSelectedAgent(agent);
    mapRef.current?.flyTo({ center: [agent.lng, agent.lat], zoom: 14, speed: 1.2 });
  }, []);

  const filtered = agents.filter((a) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!token) {
    if (compact) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#F0F0F0] text-sm text-gray-400">
          Map requires NEXT_PUBLIC_MAPBOX_TOKEN
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center bg-dash-bg" style={{ height: 'calc(100vh - 64px)' }}>
        <div className="bg-white rounded-3xl p-10 shadow-lg max-w-md text-center space-y-4">
          <h2 className="text-xl font-bold text-dash-dark">Mapbox Token Required</h2>
          <div className="bg-gray-900 text-green-400 text-sm font-mono rounded-xl p-4 text-left">
            NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...
          </div>
          <p className="text-xs text-gray-400">Add to .env.local then restart the dev server.</p>
        </div>
      </div>
    );
  }

  if (compact) {
    return <div ref={mapContainer} className="w-full h-full" />;
  }

  return (
    <div className="relative w-full overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>

      {/* Map canvas */}
      <div ref={mapContainer} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

      {/* Search — top right */}
      <div className="absolute top-5 right-5 z-20 w-80">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
          <input
            type="text"
            placeholder="Search for Agents or Location"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white rounded-full py-3.5 pl-11 pr-5 text-[13px] shadow-lg outline-none border border-gray-100"
          />
        </div>
      </div>

      {/* Search Feeds — left panel */}
      <div className="absolute top-5 left-5 z-20 w-72 bg-white rounded-3xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <h3 className="text-[15px] font-bold text-dash-dark">Search Feeds</h3>
          <button className="w-8 h-8 bg-dash-dark rounded-full flex items-center justify-center text-white hover:opacity-90 transition-all">
            <RefreshCw size={13} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-50">
          {filtered.map((agent) => (
            <button
              key={agent.id}
              onClick={() => handleAgentClick(agent)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all ${
                selectedAgent?.id === agent.id ? 'bg-dash-dark' : 'hover:bg-gray-50'
              }`}
            >
              <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border-2 border-white shadow-sm">
                <img src={agent.avatar} className="w-full h-full object-cover" alt={agent.name} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[13px] font-bold truncate ${selectedAgent?.id === agent.id ? 'text-white' : 'text-dash-dark'}`}>
                  {agent.name}
                </p>
                <p className={`text-[11px] truncate mt-0.5 ${selectedAgent?.id === agent.id ? 'text-white/50' : 'text-gray-400'}`}>
                  {agent.address}
                </p>
              </div>
              <MoreHorizontal size={16} className={selectedAgent?.id === agent.id ? 'text-white/40' : 'text-gray-300'} />
            </button>
          ))}
        </div>
      </div>

      {/* Agent popup — top right, below search */}
      {selectedAgent && (
        <div className="absolute top-20 right-5 z-20 w-60 bg-white rounded-3xl shadow-2xl p-5 animate-in zoom-in-95 fade-in duration-200">
          <div className="flex items-center justify-between mb-4">
            <button className="text-[12px] font-semibold text-dash-dark underline underline-offset-2 decoration-gray-300">
              View Full Profile
            </button>
            <div className="flex items-center gap-1.5">
              <MoreHorizontal size={15} className="text-gray-400" />
              <button
                onClick={() => setSelectedAgent(null)}
                className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 transition-all"
              >
                <X size={11} />
              </button>
            </div>
          </div>
          <div className="flex justify-center mb-3">
            <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-gray-100 shadow-md">
              <img src={selectedAgent.avatar} className="w-full h-full object-cover" alt={selectedAgent.name} />
            </div>
          </div>
          <div className="text-center space-y-1 mb-4">
            <h4 className="text-[14px] font-bold text-dash-dark">{selectedAgent.name}</h4>
            <p className="text-[11px] text-gray-400">{selectedAgent.address}</p>
            <div className="inline-block px-3.5 py-1.5 bg-[#1A452C] text-[#4ADE80] rounded-full text-[10px] font-bold mt-1">
              Presently On Field
            </div>
          </div>
          <button className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-100 rounded-2xl text-[12px] font-semibold text-gray-500 hover:bg-gray-50 transition-all">
            <MessageSquare size={14} />
            Send a message
          </button>
        </div>
      )}
    </div>
  );
}
