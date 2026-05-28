Reading the current state of key map/tracking files since several components changed since the last session — I'll gather enough context in one batch to design the correct abstraction layer before planning.  

Current map and tracking frontend deep read


## Plan: Hybrid Mapbox + Google Maps Toggle System

### Architecture in one sentence
A `MapAdapter` interface sits between the Zustand tracking store (unchanged) and the map SDK. Both providers implement the interface. A `MapRenderer` component mounts the correct adapter based on a provider flag. Switching providers destroys one adapter instance and creates another — tracking data never leaves the store.

```
WebSocket → store/tracking.ts (unchanged) → MapRenderer
                                                ├── MapboxAdapter (existing Mapbox GL code)
                                                └── GoogleAdapter  (new Google Maps impl)
```

---

## Deliverable 1: Full Implementation Strategy

### Phase A — Foundation (no behavior changes, parallel-safe)
1. Define `MapAdapter` interface and shared types in `lib/map/types.ts` — this is the single contract both SDKs implement.
2. Create `lib/map/provider-flag.ts` — reads `NEXT_PUBLIC_MAP_PROVIDER` env, exposes localStorage override for runtime toggle. Server-safe (returns `"mapbox"` on SSR).
3. Add `getGoogleMapsApiKey()` and `getActiveMapProvider()` to public-env.ts. Keep all existing Mapbox helpers unchanged.
4. Add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `NEXT_PUBLIC_MAP_PROVIDER` to .env.local.example.
5. Add CSP headers to default.conf for `*.googleapis.com`, `*.gstatic.com`, and `maps.gstatic.com`.
6. Acceptance: TypeScript compiles; no runtime changes.

### Phase B — Mapbox adapter extract (*depends on A*)
7. Create `lib/map/adapters/mapbox-adapter.ts` implementing `MapAdapter` by lifting the Mapbox GL imperative logic currently inline in `map-view.tsx` and `agent-map-view.tsx`. This is a pure refactor — all the same GL calls, same marker DOM factories, same animation.
8. Add `@googlemaps/js-api-loader` to package.json. No Google code used yet.
9. Acceptance: `map-view.tsx` delegating to `MapboxAdapter` passes all existing tracking scenarios identically.

### Phase C — Google adapter (*depends on B*)
10. Create `lib/map/adapters/google-adapter.ts` implementing the same `MapAdapter` interface using Google Maps JS API:
    - Map: `new google.maps.Map(container, options)`
    - Markers: `new google.maps.marker.AdvancedMarkerElement({ element: existingDOMElement })` — reuses same DOM elements from `map-visualization.ts`
    - Polylines: `new google.maps.Polyline({ path, strokeColor, strokeWeight })`
    - Camera: `map.panTo()`, `map.setZoom()`, `map.fitBounds()`
    - Popup: `new google.maps.InfoWindow()` styled to match existing dark popup CSS
11. Add `fetchDirectionsRouteGoogle()` to directions.ts alongside the existing Mapbox function. Same signature, same 5-minute cache TTL, same inflight dedup — calls Google Directions REST API instead of Mapbox.
12. Acceptance: Google adapter renders all markers, trails, forward routes, and camera moves matching Mapbox behavior visually.

### Phase D — Renderer and toggle (*depends on C*)
13. Create `components/map/map-renderer.tsx` — thin universal component. Accepts same props as current `MapView` and `AgentMapView`. Reads active provider, mounts correct adapter, re-mounts on provider change while preserving scroll/focus state. Cleanup is handled by adapter's `destroy()`.
14. Create `lib/map/use-map-provider.ts` — React hook exposing `{ provider, setProvider }`. Backed by provider-flag.ts. Triggers a re-render of `MapRenderer` on switch.
15. Create `components/map/provider-toggle.tsx` — visual segmented control for admin dashboard header. On click calls `setProvider()` from hook. Instant, no page reload.
16. Update map-view.tsx, agent-map-view.tsx, task-detail-modal.tsx, page.tsx to delegate to `MapRenderer` — existing component API shapes preserved so parent pages need no changes.
17. Acceptance: Switching toggle from Mapbox → Google live, then back — active agent markers, route trail, and popup all persist after provider switch.

### Phase E — Polish, performance, and deployment (*depends on D*)
18. Add lazy loading guards: Google SDK only loaded when provider=google; Mapbox GL only loaded when provider=mapbox.
19. Add next.config.ts security headers for Google Maps domains.
20. Update vps-production-post-deploy-runbook.md with Google env vars and key restriction setup. No code change.
21. Final verification matrix.

---

## Deliverable 2: Provider Abstraction Architecture

Every Mapbox-specific call extracted from map components maps directly to one `MapAdapter` method:

| Current Mapbox call | MapAdapter method |
|---|---|
| `new mapboxgl.Map(...)` + `map.on('load')` | `adapter.init(container, options)` |
| `map.remove()` + all `Marker.remove()` | `adapter.destroy()` |
| `map.flyTo() / map.easeTo()` | `adapter.setCenter(center, zoom, animated)` |
| `map.fitBounds(bounds)` | `adapter.fitBounds(bounds, padding, maxZoom)` |
| `source.setData(geojson)` | `adapter.setPolyline(id, coords, style)` |
| `new Marker({element}).setLngLat().addTo()` | `adapter.setMarker(id, coords, element, title)` |
| `marker.setLngLat()` (animation frame) | `adapter.updateMarkerPosition(id, coords)` |
| `marker.remove()` | `adapter.removeMarker(id)` |
| `new Popup().setLngLat().setHTML().addTo()` | `adapter.showPopup(coords, html)` |
| `popup.remove()` | `adapter.hidePopup()` |
| `map.on('load', ...)` | `adapter.on('ready', handler)` |

map-visualization.ts — **zero changes**. All marker DOM factory functions (`createAgentMarkerElement`, `createStaticMarkerElement`, `createPulseMarkerElement`, `updateAgentMarkerElement`) work the same for both adapters because both use custom HTML elements. `VISUAL_PALETTE`, `buildTaskTrail`, `sanitizePolyline`, `resolveVisualTaskState` remain untouched.

default-viewport.ts — **zero changes**. Both adapters consume the `ResolvedMapViewport` output identically.

---

## Deliverable 3: Dynamic Provider Switching Without State Loss

The mechanism:

1. Zustand store (tracking.ts) holds all `liveTasks` — tracking data is completely outside the map.
2. WebSocket is managed in `use-tracking-ws.ts` at hook level — independent of which map is mounted.
3. When `setProvider('google')` is called:
   - Provider flag updates (localStorage + React state).
   - `MapRenderer` unmounts the current adapter subtree, triggering `adapter.destroy()` (cleanup).
   - `MapRenderer` mounts the new adapter subtree, calling `adapter.init()`.
   - New adapter reads `store.liveTasks` (still fully populated) and renders all markers/trails on its first sync effect.
   - Camera is restored to last known viewport (stored in a `viewportRef` passed through `MapRenderer`).
4. The switch takes < 500ms and requires no API re-calls or WebSocket reconnection.

---

## Deliverable 4: Google Cloud Setup Guide

### Step 1 — Create Google Cloud Project
1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Click "New Project" → name it (e.g., `factory23-maps`).
3. Select your billing account or create one. Billing is required to use Maps JavaScript API beyond free tier.

### Step 2 — Enable APIs
Enable only what this plan requires:

| API | Why | Billable |
|---|---|---|
| **Maps JavaScript API** | Core map rendering for all surfaces | Yes (per map load) |
| **Directions API** | Forward-route preview from origin to destination | Yes (per request) |
| Geocoding API | Optional — not needed now | Yes |
| Places API | Not needed | Yes |
| Geolocation API | Not needed — browser GPS already used | No |

Navigate: APIs & Services → Library → search each name → Enable.

### Step 3 — Create API Key (Browser / Frontend)
1. APIs & Services → Credentials → Create Credentials → API Key.
2. Name it `factory23-maps-browser-key`.
3. Under "Application restrictions" → select **HTTP referrers (websites)**.
4. Add your domains:
   - `https://yourdomain.com/*`
   - `https://*.vercel.app/*` (for preview deployments)
   - `http://localhost:3000/*` (for development)
5. Under "API restrictions" → select "Restrict key" → select **Maps JavaScript API** and **Directions API** only.
6. Copy key → store in Vercel env as `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
7. Create separate keys for dev, staging, and production with different referrer restrictions.

### Step 4 — Budget Alert
Billing → Budgets & Alerts → Set a monthly budget with email alert at 50%, 90%, and 100%.

### Step 5 — Verify Restrictions
Use the API key restrictions test tool to confirm blocked requests from non-listed domains.

---

## Deliverable 5: Required Environment Variables

### Frontend (`.env.local`)

```env
# Existing — preserved
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_mapbox_token
NEXT_PUBLIC_MAPBOX_ALLOWED_HOSTS=

# New
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSy...
NEXT_PUBLIC_MAP_PROVIDER=mapbox  # or "google" — controls default on page load
```

**`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`** — browser-safe. Restricted by HTTP referrer in GCP console.
**`NEXT_PUBLIC_MAP_PROVIDER`** — build-time default. Runtime override stored in localStorage via toggle.

### Backend (`.env` — no change needed)
No server-side Google calls are introduced in this plan. If added later, create a separate server-key restricted by IP and store as `GOOGLE_MAPS_SERVER_KEY` (never `NEXT_PUBLIC_`).

---

## Deliverable 6: Files and Components to Create/Update

### New files
- `lib/map/types.ts` — `MapAdapter` interface, `MapInitOptions`, `PolylineStyle`, `MapAdapterEvent`
- `lib/map/provider-flag.ts` — provider read/write, SSR-safe, localStorage backed
- `lib/map/use-map-provider.ts` — React hook, `{ provider, setProvider }`
- `lib/map/adapters/mapbox-adapter.ts` — full `MapAdapter` impl using Mapbox GL JS
- `lib/map/adapters/google-adapter.ts` — full `MapAdapter` impl using Google Maps JS API
- `components/map/map-renderer.tsx` — universal swappable map wrapper
- `components/map/provider-toggle.tsx` — dashboard toggle control UI

### Edited files (minimal, targeted)
- public-env.ts — add `getGoogleMapsApiKey()`, `getActiveMapProvider()`; keep all Mapbox helpers
- directions.ts — add `fetchDirectionsRouteGoogle()` alongside existing Mapbox function
- globals.css — keep Mapbox CSS; add Google InfoWindow CSS reset (prevent bleed)
- .env.local.example — add Google keys section
- next.config.ts — add CSP headers via `headers()` for Google Maps domains
- default.conf — add Content-Security-Policy header for Google Maps domains
- map-view.tsx — delegate to `MapRenderer`; keep existing init logic inside `MapboxAdapter`
- agent-map-view.tsx — same delegation
- task-detail-modal.tsx — `TaskLocationMap` uses `MapRenderer` instead of inline Mapbox
- [app/agent/tasks/[id]/tracking/page.tsx](app/agent/tasks/[id]/tracking/page.tsx) — `TrackingMap` delegates to `MapRenderer`

### Files NOT changed
- tracking.ts, use-tracking-ws.ts, use-tracking.ts
- map-visualization.ts, default-viewport.ts
- All backend files, all realtime server files, all tracking DB/service files

---

## Deliverable 7: Google APIs — Complete Breakdown

### Required
| API | Required for | Tier |
|---|---|---|
| Maps JavaScript API | All map rendering (map tile, map instance, map controls) | Free $200/mo credit then billed |
| Directions API | Forward route (origin → destination polyline) | Same credit pool |

### Optional (not enabled in this plan)
| API | When to add |
|---|---|
| Geocoding API | If address→coordinates is needed server-side (not needed; GPS is used) |
| Places API | If place search/autocomplete UI is added |
| Distance Matrix API | If ETA calculations are needed in UI |
| Geolocation API | Not needed — `navigator.geolocation` (browser) is already used |

### Pricing notes for medium traffic (5k–50k map loads/day)

| Usage | Rate (post-$200 credit) |
|---|---|
| Dynamic map loads | $7 per 1,000 loads |
| Directions API request | $5 per 1,000 requests |
| Monthly at 25k map loads + 5k direction calls | ~$175 + $25 = **~$200/mo** (often within or near free credit) |

Cost controls already in this plan:
- Direction route result cached for 5 minutes — same TTL as current Mapbox caching.
- Recompute threshold: only fetch new route when agent moves > 100m from last waypoint or 2 minutes pass.
- Deduplicated inflight requests (existing pattern preserved).
- Mapbox remains available as zero-cost fallback if costs spike.

---

## Deliverable 8: Performance Strategy

| Problem | Solution |
|---|---|
| Both SDKs loading on every page | Lazy load: Google SDK loaded by `@googlemaps/js-api-loader` only if provider=google; Mapbox GL loaded only if provider=mapbox |
| SDK reloads on provider switch | Both SDKs remain in `window` after first load — only the map instance is destroyed/recreated |
| High-frequency WS updates causing redraws | `updateMarkerPosition()` called inside `requestAnimationFrame` (same as current Mapbox animation) |
| Marker DOM creation cost | DOM elements created once per task by `map-visualization.ts`, reused for both providers |
| Polyline point explosion | 2000-point cap already in store — both adapters inherit this via `buildTaskTrail()` |
| Memory leaks on unmount | `adapter.destroy()` called in React cleanup; all listeners and AdvancedMarkerElements detached |
| Route over-fetching | 5-min cache + inflight dedup preserved in Google directions adapter |

---

## Deliverable 9: Security Strategy

| Risk | Mitigation |
|---|---|
| Google API key exposure | HTTP referrer restriction in GCP console; `NEXT_PUBLIC_` prefix is intentional for browser key |
| Unauthorized map API usage | GCP API restriction to only Maps JS API + Directions API; quota alert at 80% |
| Mapbox token abuse | Existing `createMapboxTransformRequest()` allowed-host guard preserved |
| Key in source control | Both keys in `.env.local` (gitignored); never hardcoded |
| CSP bypass for Google domains | Explicit allowlist in Nginx CSP header: `maps.googleapis.com`, `maps.gstatic.com`, `*.googleapis.com` |
| Overspend | GCP budget alert; Mapbox fallback always available |
| Mixed environment key leak | Separate GCP API keys per environment (dev/stage/prod) with separate referrer restrictions |

---

## Deliverable 10: Rollback Strategy

| Scenario | Action | Time |
|---|---|---|
| Bugs in Google adapter | Toggle dashboard switch to Mapbox | Instant |
| Google cost spike | Set `NEXT_PUBLIC_MAP_PROVIDER=mapbox` in Vercel | 1 Vercel redeploy |
| Google API quota exceeded | Same env var change; Mapbox unaffected | 1 Vercel redeploy |
| Both adapters broken | `NEXT_PUBLIC_MAP_PROVIDER=mapbox`; revert only google-adapter.ts | Minutes |
| Full rollback | Revert Phase D edit to map-view.tsx (remove MapRenderer delegation) | 1 commit |

No backend rollback ever required — the backend is untouched.

---

## Scope Boundaries

**Included:** provider abstraction layer, Google Maps JS adapter, Google Directions adapter, provider toggle UI, env/deployment/CSP updates, key management instructions, cost/security guidance.

**Not included:** changes to task lifecycle, geofence logic, arrival detection, Redis/WebSocket contracts, backend APIs, tracking database, coordinate storage, or coordinate precision semantics.

Ready to implement. Confirm and I'll start with Phase A — the `MapAdapter` interface and provider flag system, followed immediately by the `MapboxAdapter` extract and `GoogleAdapter` build.