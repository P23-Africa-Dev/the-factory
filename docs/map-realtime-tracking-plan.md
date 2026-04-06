# Real-Time Agent Tracking Map — Implementation Plan

> **Project:** The Factory Dashboard — `app/(dashboard)/map/page.tsx`
> **Goal:** Aggregators see their agents' live GPS positions on a customisable map, with smooth animation, profile pop-ups, route lines, and a searchable agent sidebar.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack & Rationale](#2-tech-stack--rationale)
3. [Dependencies to Install](#3-dependencies-to-install)
4. [File & Folder Structure](#4-file--folder-structure)
5. [Phase 1 — Static Map Scaffold](#5-phase-1--static-map-scaffold)
6. [Phase 2 — Custom Map Style & Markers](#6-phase-2--custom-map-style--markers)
7. [Phase 3 — Zustand Agent Store](#7-phase-3--zustand-agent-store)
8. [Phase 4 — Socket.IO Real-Time Integration](#8-phase-4--socketio-real-time-integration)
9. [Phase 5 — REST Snapshot on Load](#9-phase-5--rest-snapshot-on-load)
10. [Phase 6 — Route Polylines](#10-phase-6--route-polylines)
11. [Phase 7 — Smooth Marker Animation](#11-phase-7--smooth-marker-animation)
12. [Phase 8 — Stale Agent Handling](#12-phase-8--stale-agent-handling)
13. [Phase 9 — Sidebar & Search](#13-phase-9--sidebar--search)
14. [Phase 10 — Agent Profile Pop-up Card](#14-phase-10--agent-profile-pop-up-card)
15. [Server-Side Architecture](#15-server-side-architecture)
16. [Redis Schema](#16-redis-schema)
17. [Mobile Agent App (GPS Emission)](#17-mobile-agent-app-gps-emission)
18. [Performance Considerations](#18-performance-considerations)
19. [Environment Variables](#19-environment-variables)
20. [Testing Strategy](#20-testing-strategy)
21. [Deployment Checklist](#21-deployment-checklist)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        AGGREGATOR BROWSER                        │
│                                                                  │
│  ┌──────────────┐    ┌──────────────────────────────────────┐   │
│  │ Agent Sidebar│    │         MapLibre GL Map Canvas        │   │
│  │  (Zustand)   │    │  ┌──────────────────────────────┐    │   │
│  │              │    │  │  Custom HTML Markers (agents) │    │   │
│  │  - search    │    │  │  Route Polyline GeoJSON layer │    │   │
│  │  - status    │    │  │  Aggregator location pin      │    │   │
│  │  - online    │    │  └──────────────────────────────┘    │   │
│  └──────────────┘    └──────────────────────────────────────┘   │
│          │                           │                           │
│          └───────────────────────────┘                           │
│                    Zustand Agent Store                           │
│                { agentId → { lat, lng, name, status } }         │
└───────────────────────────────┬─────────────────────────────────┘
                                │  socket.io-client
                                │  (room: aggregator_{id})
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   SOCKET.IO SERVER (Node.js)                    │
│                                                                  │
│  on('agent:location') ──► broadcast to room ──► Redis pub/sub  │
│  on('connect')        ──► join aggregator room                  │
│  REST /api/agents/snapshot ──► Redis HGETALL                    │
└───────────────────────────────┬─────────────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                  ▼
         Redis Cache       PostgreSQL         Socket.IO
    (last known pos)   (history + users)   Redis Adapter
                                           (multi-instance)
              ▲
              │  GPS emit every 4s
┌─────────────┴───────────────────────────────────────────────────┐
│                    AGENT MOBILE APP (Expo)                       │
│                                                                  │
│  expo-location watchPositionAsync → socket.emit('agent:location')│
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Tech Stack & Rationale

| Layer | Choice | Why |
|---|---|---|
| **Map rendering** | `maplibre-gl` + `react-map-gl` | Open-source, free, GPU-accelerated, fully style-customisable |
| **Map tiles** | Maptiler "Dataviz Light" | Clean white/grey street style that matches the design; 100k req/month free |
| **Real-time** | `socket.io-client` | Rooms, auto-reconnect, fallback to long-polling |
| **State** | `zustand` | Minimal re-renders — only the updated agent's marker re-renders |
| **Cache** | Redis | Instant initial load of all agent positions; horizontal scaling |
| **DB** | PostgreSQL + PostGIS | Persist location history; geospatial queries |
| **Mobile GPS** | Expo + `expo-location` | Background location tracking on iOS + Android |
| **Routing engine** | Maptiler Directions API (or OSRM) | Generate delivery route polylines |

---

## 3. Dependencies to Install

### Frontend (Next.js app)

```bash
# Map (maplibre ships its own TS types — do NOT install @types/maplibre-gl)
yarn add maplibre-gl react-map-gl

# Real-time client
yarn add socket.io-client

# State management
yarn add zustand
```

### Backend (Node.js / NestJS server)

```bash
npm install socket.io ioredis @socket.io/redis-adapter
npm install pg  # or prisma, drizzle, etc.
```

### Mobile (Expo agent app)

```bash
npx expo install expo-location
npm install socket.io-client
```

> ⚠️ **Critical Next.js Note:** `maplibre-gl` accesses `window` and cannot run server-side.
> Always wrap the map component with:
> ```ts
> const MapView = dynamic(() => import("@/components/map/MapView"), { ssr: false });
> ```

---

## 4. File & Folder Structure

```
app/
└── (dashboard)/
    └── map/
        └── page.tsx                    ← Page shell, loads MapView dynamically (ssr: false)

components/
└── map/
    ├── MapView.tsx                     ← Main map component (client-only)
    ├── AgentMarker.tsx                 ← Custom HTML marker per agent
    ├── AgentProfileCard.tsx            ← Pop-up card shown on marker click
    ├── AgentSidebar.tsx                ← Left sidebar with search + agent list
    ├── AgentSidebarItem.tsx            ← Individual agent row in sidebar
    ├── RouteLayer.tsx                  ← GeoJSON LineString layer (blue route)
    ├── BreadcrumbLayer.tsx             ← Agent's live GPS trail layer
    ├── AggregatorPin.tsx               ← Aggregator's own position on map
    ├── MapSearchBar.tsx                ← Top-right search input overlay
    └── StaleAgentBadge.tsx             ← "Last seen X min ago" indicator

lib/
├── store/
│   └── use-agent-store.ts             ← Zustand store (single source of truth)
├── socket/
│   └── use-map-socket.ts              ← Socket.IO hook for the map page
└── utils/
    ├── animate-marker.ts              ← requestAnimationFrame lerp helper
    ├── agent-geojson.ts               ← Convert agents array to GeoJSON
    └── format-last-seen.ts            ← "3 min ago" human-readable formatter

types/
└── map.ts                             ← Agent, AgentStatus, AgentMap types
```

---

## 5. Phase 1 — Static Map Scaffold

**Goal:** Get the map rendering with the correct tile style — no agents yet.

### `app/(dashboard)/map/page.tsx`

```tsx
"use client";

import dynamic from "next/dynamic";

// CRITICAL: MapLibre uses `window` — must be client-only
const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="h-screen flex items-center justify-center bg-gray-100">
      <p className="text-gray-400 text-sm animate-pulse">Loading map...</p>
    </div>
  ),
});

export default function MapPage() {
  return <MapView />;
}
```

### `components/map/MapView.tsx`

```tsx
"use client";

import Map from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY!;
const MAP_STYLE = `https://api.maptiler.com/maps/dataviz-light/style.json?key=${MAPTILER_KEY}`;

export default function MapView() {
  return (
    <div className="relative w-full h-screen overflow-hidden">
      <Map
        initialViewState={{
          longitude: -1.6833,  // Set to your region's coordinates
          latitude: 6.7000,
          zoom: 13,
        }}
        style={{ width: "100%", height: "100%" }}
        mapStyle={MAP_STYLE}
        attributionControl={false}
      />
    </div>
  );
}
```

---

## 6. Phase 2 — Custom Map Style & Markers

### Getting the Maptiler Key

1. Sign up at [maptiler.com](https://maptiler.com) (free tier, no credit card)
2. Account → API Keys → copy your key
3. Add to `.env.local`: `NEXT_PUBLIC_MAPTILER_KEY=your_key_here`
4. Restrict the key to your domain in Maptiler dashboard to prevent abuse

### Recommended Style Options

| Style Name | URL Slug | Best For |
|---|---|---|
| **Dataviz Light** | `dataviz-light` | ⭐ Closest to the design — very clean |
| Positron | `positron` | Ultra-minimal, pure white |
| Streets v2 | `streets-v2` | More road detail visible |

You can also build a fully custom style at [style.maptiler.com](https://style.maptiler.com) using the visual Maputnik editor — export the JSON and serve it locally for full pixel-perfect control.

### Custom Agent Marker Component

```tsx
// components/map/AgentMarker.tsx
"use client";

import { Marker } from "react-map-gl/maplibre";
import type { Agent } from "@/types/map";

interface Props {
  agent: Agent;
  onClick: (agent: Agent) => void;
}

export function AgentMarker({ agent, onClick }: Props) {
  const statusColor = {
    active: "border-green-400",
    idle: "border-orange-400",
    offline: "border-gray-300",
    stale: "border-gray-300",
  }[agent.status];

  return (
    <Marker longitude={agent.lng} latitude={agent.lat} anchor="bottom">
      <div
        onClick={() => onClick(agent)}
        className="flex flex-col items-center cursor-pointer group"
      >
        {/* Name + address tag */}
        <div className="bg-white rounded-lg px-2.5 py-1 shadow-md mb-1.5 text-center">
          <p className="text-[11px] font-bold text-[#0B1215] whitespace-nowrap">{agent.name}</p>
          <p className="text-[9px] text-gray-400 whitespace-nowrap truncate max-w-[120px]">
            Active at {agent.currentAddress ?? "Unknown location"}
          </p>
        </div>
        {/* Avatar circle with status ring */}
        <div
          className={`w-10 h-10 rounded-full border-2 overflow-hidden shadow-lg
            transition-transform group-hover:scale-110 ${statusColor}`}
        >
          <img
            src={agent.avatarUrl ?? "/default-avatar.png"}
            alt={agent.name}
            className="w-full h-full object-cover"
          />
        </div>
        {/* Red drop pin */}
        <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[10px]
          border-l-transparent border-r-transparent border-t-red-500 mt-0.5" />
      </div>
    </Marker>
  );
}
```

---

## 7. Phase 3 — Zustand Agent Store

### Type Definitions

```ts
// types/map.ts

export type AgentStatus = "active" | "idle" | "offline" | "stale";

export interface Agent {
  id: string;
  name: string;
  avatarUrl?: string;
  status: AgentStatus;
  lat: number;
  lng: number;
  lastSeen: number;             // Unix timestamp ms
  currentAddress?: string;
  routeCoords?: [number, number][];  // Pre-computed delivery route
}

export type AgentMap = Record<string, Agent>;
```

### Zustand Store

```ts
// lib/store/use-agent-store.ts
import { create } from "zustand";
import type { Agent, AgentMap } from "@/types/map";

interface AgentStore {
  agents: AgentMap;
  selectedAgentId: string | null;
  searchQuery: string;

  // Actions
  setAgents: (agents: AgentMap) => void;
  updateAgent: (id: string, patch: Partial<Agent>) => void;
  selectAgent: (id: string | null) => void;
  setSearchQuery: (q: string) => void;

  // Computed
  filteredAgents: () => Agent[];
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: {},
  selectedAgentId: null,
  searchQuery: "",

  setAgents: (agents) => set({ agents }),

  // Only merges the changed fields — triggers minimal re-render
  updateAgent: (id, patch) =>
    set((state) => ({
      agents: {
        ...state.agents,
        [id]: { ...state.agents[id], ...patch, lastSeen: Date.now() },
      },
    })),

  selectAgent: (id) => set({ selectedAgentId: id }),
  setSearchQuery: (q) => set({ searchQuery: q }),

  filteredAgents: () => {
    const { agents, searchQuery } = get();
    const q = searchQuery.toLowerCase();
    if (!q) return Object.values(agents);
    return Object.values(agents).filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.currentAddress ?? "").toLowerCase().includes(q)
    );
  },
}));
```

---

## 8. Phase 4 — Socket.IO Real-Time Integration

### Client Hook

```ts
// lib/socket/use-map-socket.ts
"use client";

import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useAgentStore } from "@/lib/store/use-agent-store";

interface LocationEvent {
  agentId: string;
  lat: number;
  lng: number;
  status: string;
  address?: string;
}

export function useMapSocket(aggregatorId: string) {
  const socketRef = useRef<Socket | null>(null);
  const updateAgent = useAgentStore((s) => s.updateAgent);

  useEffect(() => {
    if (!aggregatorId) return;

    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
      auth: { aggregatorId },
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join:aggregator", { aggregatorId });
    });

    // Primary: live location update
    socket.on("agent:moved", (data: LocationEvent) => {
      updateAgent(data.agentId, {
        lat: data.lat,
        lng: data.lng,
        status: data.status as any,
        currentAddress: data.address,
      });
    });

    // Status-only update (online/offline without new coords)
    socket.on("agent:status", (data: { agentId: string; status: string }) => {
      updateAgent(data.agentId, { status: data.status as any });
    });

    return () => {
      socket.disconnect();
    };
  }, [aggregatorId]);

  return socketRef;
}
```

### Server-Side Handler (your Node.js backend)

```ts
// server/socket/map.handler.ts

io.on("connection", (socket) => {

  socket.on("join:aggregator", ({ aggregatorId }) => {
    socket.join(`aggregator:${aggregatorId}`);
  });

  socket.on("agent:location", async (data) => {
    const { aggregatorId, agentId, lat, lng, address, status } = data;

    // 1. Update Redis hash (fast, ~1ms) — last known position
    await redis.hset(
      `locations:${aggregatorId}`,
      agentId,
      JSON.stringify({ lat, lng, address, status, ts: Date.now() })
    );

    // 2. Append to history sorted set (for breadcrumb trail)
    await redis.zadd(
      `history:${agentId}`,
      Date.now(),
      JSON.stringify({ lat, lng })
    );
    // Trim to last 500 points to prevent unbounded growth
    await redis.zremrangebyrank(`history:${agentId}`, 0, -501);

    // 3. Broadcast ONLY to this aggregator's room
    io.to(`aggregator:${aggregatorId}`).emit("agent:moved", {
      agentId, lat, lng, address, status,
    });

    // 4. Throttled DB persist (every 30s per agent — not every ping)
    await throttledPersist(agentId, { lat, lng, ts: Date.now() });
  });
});
```

---

## 9. Phase 5 — REST Snapshot on Load

When the aggregator opens the map, fetch all agents' last known positions from Redis instantly — don't wait for the next GPS ping which could be 4+ seconds away.

### Route Handler

```ts
// app/api/agents/snapshot/route.ts
import { redis } from "@/lib/redis";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const aggregatorId = req.nextUrl.searchParams.get("aggregatorId");
  if (!aggregatorId)
    return NextResponse.json({ error: "Missing aggregatorId" }, { status: 400 });

  const raw = await redis.hgetall(`locations:${aggregatorId}`);
  if (!raw) return NextResponse.json({});

  // Also fetch agent metadata (name, avatar) from PostgreSQL or Redis
  const agents: Record<string, any> = {};
  for (const [agentId, json] of Object.entries(raw)) {
    agents[agentId] = { id: agentId, ...JSON.parse(json as string) };
  }

  return NextResponse.json(agents);
}
```

### Call on MapView Mount

```ts
// Inside MapView.tsx
useEffect(() => {
  fetch(`/api/agents/snapshot?aggregatorId=${aggregatorId}`)
    .then((r) => r.json())
    .then((data) => {
      useAgentStore.getState().setAgents(data);
    });
}, []);
```

---

## 10. Phase 6 — Route Polylines

There are two distinct lines to render:

### A. Pre-Computed Delivery Route (static, fetched once)

```ts
// Fetch from Maptiler Directions API
async function fetchDeliveryRoute(
  start: [number, number],
  end: [number, number]
): Promise<[number, number][]> {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const url = `https://api.maptiler.com/directions/v2/route/${start.join(",")};${end.join(",")}`
    + `?key=${key}&geometries=geojson&profile=car`;
  const res = await fetch(url);
  const data = await res.json();
  return data.routes[0].geometry.coordinates;
}
```

### B. Live Breadcrumb Trail (from Redis history)

```ts
// app/api/agents/[agentId]/trail/route.ts
const history = await redis.zrangebyscore(`history:${agentId}`, "-inf", "+inf");
const coords = history.map((h) => {
  const { lat, lng } = JSON.parse(h);
  return [lng, lat] as [number, number];  // GeoJSON is [lng, lat]
});
```

### RouteLayer Component

```tsx
// components/map/RouteLayer.tsx
import { Source, Layer } from "react-map-gl/maplibre";

export function RouteLayer({ coordinates }: { coordinates: [number, number][] }) {
  const data: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      geometry: { type: "LineString", coordinates },
      properties: {},
    }],
  };

  return (
    <Source id="route" type="geojson" data={data}>
      <Layer
        id="route-line"
        type="line"
        paint={{
          "line-color": "#3B82F6",    // Blue matching design
          "line-width": 5,
          "line-cap": "round",
          "line-join": "round",
          "line-opacity": 0.9,
        }}
      />
    </Source>
  );
}
```

---

## 11. Phase 7 — Smooth Marker Animation

Without animation, markers teleport on each GPS update. This interpolates position using an eased transition over ~1 second.

```ts
// lib/utils/animate-marker.ts
import type maplibregl from "maplibre-gl";

export function animateToPosition(
  marker: maplibregl.Marker,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  duration = 1000
) {
  const start = performance.now();

  // Ease in-out for natural movement feel
  function ease(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  function frame(now: number) {
    const elapsed = now - start;
    const t = ease(Math.min(elapsed / duration, 1));

    marker.setLngLat([
      from.lng + (to.lng - from.lng) * t,
      from.lat + (to.lat - from.lat) * t,
    ]);

    if (elapsed < duration) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
```

**Usage in AgentMarker:**
- Keep `markerRef = useRef<maplibregl.Marker>(null)`
- In a `useEffect` watching `[agent.lat, agent.lng]`, call:
  ```ts
  animateToPosition(markerRef.current, prevPos, { lat: agent.lat, lng: agent.lng })
  ```

---

## 12. Phase 8 — Stale Agent Handling

If an agent's GPS stops emitting (phone dies, goes underground), visually indicate staleness.

```ts
// lib/utils/format-last-seen.ts

export function formatLastSeen(lastSeenMs: number): string {
  const diffS = Math.floor((Date.now() - lastSeenMs) / 1000);
  if (diffS < 60) return "Just now";
  if (diffS < 3600) return `${Math.floor(diffS / 60)} min ago`;
  return `${Math.floor(diffS / 3600)}h ago`;
}

export function getAgentStaleness(lastSeenMs: number): "fresh" | "stale" | "offline" {
  const diffMin = (Date.now() - lastSeenMs) / 60_000;
  if (diffMin < 2) return "fresh";
  if (diffMin < 10) return "stale";
  return "offline";
}
```

**Run a cleanup interval in MapView.tsx:**

```ts
useEffect(() => {
  const interval = setInterval(() => {
    const { agents, updateAgent } = useAgentStore.getState();
    Object.values(agents).forEach((agent) => {
      const staleness = getAgentStaleness(agent.lastSeen);
      if (staleness !== "fresh" && agent.status !== staleness) {
        updateAgent(agent.id, { status: staleness });
      }
    });
  }, 30_000); // Check every 30 seconds

  return () => clearInterval(interval);
}, []);
```

Stale markers should render greyed-out with opacity-50 and show a "Last seen X min ago" badge.

---

## 13. Phase 9 — Sidebar & Search

```tsx
// components/map/AgentSidebar.tsx
"use client";

import { useAgentStore } from "@/lib/store/use-agent-store";
import { AgentSidebarItem } from "./AgentSidebarItem";
import { Search } from "lucide-react";

export function AgentSidebar() {
  const { searchQuery, setSearchQuery, filteredAgents, selectAgent, selectedAgentId } =
    useAgentStore();
  const agents = filteredAgents();

  return (
    <div className="absolute top-6 left-6 z-20 w-72 bg-white rounded-[24px] shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100">
        <h3 className="font-bold text-[15px] text-[#0B1215]">Search Feeds</h3>
        <div className="w-8 h-8 bg-[#0B1215] rounded-full flex items-center justify-center">
          <Search size={14} className="text-white" />
        </div>
      </div>

      {/* Agent List */}
      <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-50 scrollbar-hide">
        {agents.map((agent) => (
          <AgentSidebarItem
            key={agent.id}
            agent={agent}
            isSelected={agent.id === selectedAgentId}
            onClick={() => selectAgent(agent.id === selectedAgentId ? null : agent.id)}
          />
        ))}
        {agents.length === 0 && (
          <p className="text-center text-xs text-gray-400 py-8">No agents found</p>
        )}
      </div>
    </div>
  );
}
```

```tsx
// components/map/MapSearchBar.tsx — Top-right overlay
export function MapSearchBar() {
  const { searchQuery, setSearchQuery } = useAgentStore();
  return (
    <div className="absolute top-6 right-6 z-20 w-80">
      <div className="bg-white rounded-full px-5 py-3 shadow-xl flex items-center gap-3">
        <Search size={16} className="text-gray-400 shrink-0" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search for Agents or Location"
          className="flex-1 text-sm text-gray-600 placeholder:text-gray-300 outline-none bg-transparent"
        />
      </div>
    </div>
  );
}
```

---

## 14. Phase 10 — Agent Profile Pop-up Card

```tsx
// components/map/AgentProfileCard.tsx
"use client";

import { X, MessageSquare, MoreVertical, ExternalLink } from "lucide-react";
import { useAgentStore } from "@/lib/store/use-agent-store";
import { formatLastSeen } from "@/lib/utils/format-last-seen";

export function AgentProfileCard() {
  const { agents, selectedAgentId, selectAgent } = useAgentStore();
  const agent = selectedAgentId ? agents[selectedAgentId] : null;

  if (!agent) return null;

  return (
    <div className="absolute top-20 right-6 z-20 w-72 bg-white rounded-[24px] shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center px-5 pt-5 pb-3">
        <button className="flex items-center gap-1.5 text-sm font-semibold text-[#0B1215] hover:underline">
          <ExternalLink size={13} /> View Full Profile
        </button>
        <div className="flex items-center gap-2">
          <MoreVertical size={16} className="text-gray-300" />
          <button
            onClick={() => selectAgent(null)}
            className="w-6 h-6 rounded-full hover:bg-gray-100 flex items-center justify-center"
          >
            <X size={14} className="text-gray-400" />
          </button>
        </div>
      </div>

      {/* Avatar */}
      <div className="flex justify-center py-4">
        <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-gray-100 shadow-md">
          <img
            src={agent.avatarUrl ?? "/default-avatar.png"}
            alt={agent.name}
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Info */}
      <div className="text-center px-5 mb-4">
        <h3 className="font-bold text-[17px] text-[#0B1215]">{agent.name}</h3>
        <p className="text-gray-400 text-sm mt-0.5">
          {agent.currentAddress ?? "Location unknown"}
        </p>
        <p className="text-gray-300 text-xs mt-1">{formatLastSeen(agent.lastSeen)}</p>
      </div>

      {/* Status Badge */}
      <div className="flex justify-center mb-4">
        <span
          className={`px-5 py-1.5 rounded-full text-xs font-bold ${
            agent.status === "active"
              ? "bg-green-100 text-green-700"
              : agent.status === "idle"
              ? "bg-orange-100 text-orange-700"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {agent.status === "active" ? "🟢 Presently On Field"
           : agent.status === "idle" ? "🟡 Idle"
           : "⚫ Offline"}
        </span>
      </div>

      {/* Message Button */}
      <div className="px-5 pb-5">
        <button className="w-full flex items-center justify-center gap-2 py-3 border
          border-gray-200 rounded-2xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          <MessageSquare size={15} />
          Send a message
        </button>
      </div>
    </div>
  );
}
```

---

## 15. Server-Side Architecture

### Recommended Server Structure

```
server/
├── index.ts                ← Express + Socket.IO + Redis adapter setup
├── socket/
│   ├── index.ts            ← Register all socket namespaces
│   └── map.handler.ts      ← Location event handlers
├── routes/
│   ├── agents.ts           ← GET /agents/snapshot, GET /agents/:id/trail
│   └── auth.ts             ← POST /auth/socket-token
├── lib/
│   ├── redis.ts            ← ioredis singleton
│   ├── db.ts               ← PostgreSQL client
│   └── throttle.ts         ← Per-agent DB write throttling
└── middleware/
    └── auth.ts             ← Verify aggregator JWT on socket connect
```

### Redis Pub/Sub Adapter (for horizontal scaling)

```ts
// server/index.ts
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));
// Now multiple Node.js instances share the same Socket.IO rooms via Redis
```

---

## 16. Redis Schema

| Key Pattern | Type | Contents | TTL |
|---|---|---|---|
| `locations:{aggregatorId}` | Hash | `agentId → { lat, lng, status, address, ts }` | 24 hours |
| `history:{agentId}` | Sorted Set | Score = timestamp, Value = `{ lat, lng }` | 7 days |
| `agent:meta:{agentId}` | Hash | `{ name, avatarUrl, phone, aggregatorId }` | No TTL |
| `session:{socketId}` | String | `{ agentId, aggregatorId }` | Socket lifetime |

### PostgreSQL Schema (for history persistence)

```sql
CREATE TABLE agent_locations (
  id          BIGSERIAL PRIMARY KEY,
  agent_id    UUID NOT NULL,
  location    GEOGRAPHY(POINT, 4326) NOT NULL,  -- PostGIS
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast time-range queries per agent
CREATE INDEX ON agent_locations (agent_id, recorded_at DESC);

-- Partition by date for large-scale history (optional)
```

---

## 17. Mobile Agent App (GPS Emission)

```ts
// Expo agent app — background GPS watcher

import * as Location from "expo-location";
import { io } from "socket.io-client";
import { AppState } from "react-native";

const socket = io(SOCKET_URL, {
  auth: { agentId, aggregatorId, token: authToken },
  transports: ["websocket"],
  reconnection: true,
});

// Request permissions (must be called on user gesture)
const { status: fg } = await Location.requestForegroundPermissionsAsync();
const { status: bg } = await Location.requestBackgroundPermissionsAsync();

if (fg !== "granted" || bg !== "granted") {
  alert("Location permissions required for tracking");
  return;
}

// Adaptive accuracy based on app state
let currentAccuracy = Location.Accuracy.Balanced;

AppState.addEventListener("change", (state) => {
  // Reduce accuracy when app is backgrounded to save battery
  currentAccuracy = state === "active"
    ? Location.Accuracy.Balanced
    : Location.Accuracy.Low;
});

// Watch position — emit on movement or every 4 seconds
const watcher = await Location.watchPositionAsync(
  {
    accuracy: currentAccuracy,
    timeInterval: 4000,          // Max: every 4 seconds
    distanceInterval: 10,        // Or when moved 10 meters
  },
  async (location) => {
    const { latitude, longitude, speed } = location.coords;

    // Reverse geocode for human-readable address (cached 5min)
    const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });
    const addressStr = [address.street, address.city].filter(Boolean).join(", ");

    socket.emit("agent:location", {
      aggregatorId,
      agentId,
      lat: latitude,
      lng: longitude,
      address: addressStr,
      status: (speed ?? 0) > 0.5 ? "active" : "idle",  // Moving vs. stationary
    });
  }
);

// Stop when agent logs out
function stopTracking() {
  watcher.remove();
  socket.emit("agent:status", { agentId, status: "offline" });
  socket.disconnect();
}
```

---

## 18. Performance Considerations

| Concern | Problem | Solution |
|---|---|---|
| 50+ agents on map | HTML markers = 50+ DOM nodes thrashing | Switch to MapLibre symbol layers (GPU-rendered, single draw call) |
| Reverse geocoding cost | API charges per call | Cache by `${lat.toFixed(4)},${lng.toFixed(4)}` in Redis for 5 minutes |
| Redis memory growth | Sorted set grows forever | `ZREMRANGEBYSCORE` every hour for data older than 7 days |
| Multiple open tabs | Duplicate socket connections | Socket.IO rooms handle fan-out; rooms naturally isolate aggregators |
| Battery drain (mobile) | Continuous GPS = 15–20% battery/hour | `distanceInterval: 10` + adaptive accuracy reduces drain by ~40% |
| Map tile rate limits | Maptiler free = 100k/month | Monitor usage; upgrade plan or switch to self-hosted OpenFreeMap tiles |
| Socket spam reconnect | Poor network causes rapid reconnects | `reconnectionDelay: 1000, reconnectionDelayMax: 30000` with backoff |

---

## 19. Environment Variables

```bash
# .env.local (Next.js frontend)
NEXT_PUBLIC_MAPTILER_KEY=your_maptiler_api_key_here
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001

# .env (Backend server)
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://user:password@localhost:5432/factory_db
JWT_SECRET=your_very_long_random_secret_here
PORT=3001
CORS_ORIGIN=http://localhost:3000

# Production overrides
NEXT_PUBLIC_SOCKET_URL=wss://socket.your-domain.com
```

---

## 20. Testing Strategy

### Unit Tests

```ts
// test/animate-marker.test.ts
// Verify lerp values: at t=0 returns start, at t=1 returns end, at t=0.5 returns midpoint

// test/format-last-seen.test.ts
// Verify all time brackets: <60s, 1–59min, 1h+

// test/use-agent-store.test.ts
// Verify updateAgent only merges changed fields, filteredAgents respects search
```

### Socket Integration Tests

```ts
// Emit agent:location from a test socket
// Assert the aggregator's room socket receives agent:moved
// Assert a second aggregator does NOT receive the event (room isolation)
```

### E2E Tests (Playwright)

```ts
test("Agent marker appears within 500ms of socket event", async ({ page }) => {
  await page.goto("/map");
  // Inject a mock socket event
  await page.evaluate(() => {
    window.__mockSocket.emit("agent:moved", {
      agentId: "agent-1", lat: 6.5244, lng: 3.3792, status: "active"
    });
  });
  await expect(page.locator('[data-testid="agent-marker-agent-1"]')).toBeVisible();
});
```

### Manual QA Checklist

- [ ] Map loads within 2 seconds on a simulated Slow 3G connection
- [ ] All agents appear on map immediately after load (snapshot fetch working)
- [ ] Agent marker animates smoothly — no teleporting
- [ ] Stale badge appears after 2 minutes of no GPS updates
- [ ] Sidebar search filters list in real-time as you type
- [ ] Clicking a marker opens the profile card
- [ ] Clicking X on profile card closes it
- [ ] Route polyline renders in correct blue colour
- [ ] Two aggregators logged in simultaneously cannot see each other's agents
- [ ] Socket reconnects automatically after network interruption
- [ ] Mobile: Background location continues when app is minimised to home screen

---

## 21. Deployment Checklist

- [ ] Maptiler API key scoped to production domain only (prevent abuse & quota theft)
- [ ] Socket.IO server behind Nginx with proper WebSocket upgrade headers:
  ```nginx
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  ```
- [ ] SSL/TLS configured — use `wss://` in production (never plain `ws://`)
- [ ] Redis `maxmemory-policy allkeys-lru` set to prevent out-of-memory crash
- [ ] CORS on Socket.IO server restricted to your exact domain
- [ ] JWT verified on every `connection` event — reject unauthorised sockets at the door
- [ ] Redis pub/sub adapter installed for multi-instance Socket.IO horizontal scaling
- [ ] PostGIS extension enabled on PostgreSQL: `CREATE EXTENSION postgis;`
- [ ] Background location permissions documented for iOS App Store review submission
- [ ] Monitoring: Set up alerts for Redis memory usage and socket connection count
- [ ] Rate limit the `agent:location` event on the server (max 1 per 2 seconds per agent)

---

## Recommended Implementation Order

```
Week 1  │ Phase 1–3   │ Static map renders + Zustand store + mock agent data hardcoded
Week 2  │ Phase 4–5   │ Socket.IO client hook + REST snapshot API
Week 3  │ Phase 6–8   │ Route polylines + marker animation + stale handling
Week 4  │ Phase 9–10  │ Sidebar + search + profile card polish
Week 5  │ Phase 11+   │ Mobile app GPS emission + Redis persistence + E2E tests
Week 6  │ Deploy      │ Production hardening — SSL, CORS, Redis limits, monitoring
```

---

*Each phase is independently shippable — the map works at every step, with progressively richer features added on top.*
