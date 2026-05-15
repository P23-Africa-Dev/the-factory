# Live Task Tracking — Implementation Plan

> **Sources:** `TRACKING_SYSTEM_ARCHITECTURE_REVIEW.md`, `api docs/frontend-guide/task-tracking-realtime.md`
> **Goal:** Replace dummy Mapbox data with task-driven live tracking (REST + WebSocket relay).
> **Last updated:** 2026-05-15

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State](#current-state)
3. [Target Architecture](#target-architecture)
4. [Phase 0 — Align Contracts and Environment](#phase-0--align-contracts-and-environment)
5. [Phase 1 — Shared Foundation](#phase-1--shared-foundation)
6. [Phase 2 — Agent Workflow](#phase-2--agent-workflow)
7. [Phase 3 — Management Map](#phase-3--management-map)
8. [Phase 4 — Task Creation and Destination Coords](#phase-4--task-creation--destination-coords)
9. [Phase 5 — Marker Tags, Status, and Staleness](#phase-5--marker-tags-status-and-staleness)
10. [Phase 6 — Route History](#phase-6--route-history)
11. [Phase 7 — Security, Errors, and Edge Cases](#phase-7--security-errors-and-edge-cases)
12. [Phase 8 — Testing Plan](#phase-8--testing-plan)
13. [Recommended Implementation Order](#recommended-implementation-order)
14. [Full File Changelist](#full-file-changelist)
15. [Design Decision: One "Commence" Button](#design-decision-one-commence-button)

---

## Executive Summary

The repo contains **two different "map tracking" stories** in the docs. Only one matches what the backend actually implements:

| Document | Transport | Use? |
|----------|-----------|------|
| `TRACKING_SYSTEM_ARCHITECTURE_REVIEW.md` + `api docs/frontend-guide/task-tracking-realtime.md` | REST task tracking + Node WebSocket relay (`/tracking-ws`) | **YES — follow this** |
| `api docs/features/map-live-tracking.md` + `docs/map-realtime-tracking-plan.md` | Reverb/Echo or Socket.IO + `GET /agents/locations` | **NO — stale spec, ignore** |

**Do not implement Reverb, Echo, or Socket.IO.** The correct live path is: agent starts tracking on a task → Laravel persists points → Redis events → Node WebSocket relay → admin/agent map updates.

**Today's state:** `components/map/map-view.tsx` uses hardcoded agents and a `setInterval` jitter simulation. The "Commence Task" button in `task-detail-modal.tsx` only calls `PATCH /tasks/{id}/status` and never starts a tracking session. Tasks are often created without `latitude`/`longitude`, which means arrival detection silently never fires.

**None of the tracking APIs are wired to the frontend.** This plan fixes all of that.

---

## Current State

### Already in place

- **Mapbox UI** in `components/map/map-view.tsx` — markers, route line, destination pulse, sidebar, popup tags (all demo-only).
- **Map pages:** `app/admin/map/page.tsx`, `app/agent/map/page.tsx`, compact embed via `components/dashboard/dashboard-map.tsx`.
- **Task CRUD** via `lib/api/tasks.ts` + existing task hooks.
- **Backend tracking APIs** fully implemented: `/api/v1/agent/tasks/{task}/start|location|complete|route` and admin route read.
- **WebSocket relay** proxied at `/tracking-ws` (confirmed in `backend/docker/nginx/default.conf`).
- **Auth pattern** established: token from `factory_auth_token` cookie, company ID from `useAuthStore`.
- **`apiRequest` utility** in `lib/api/onboarding.ts` with `ApiEnvelope<T>` and `ApiRequestError`.
- **`POST .../start` auto-transitions** `pending → in_progress` inside `TaskTrackingService::start()` — a separate status PATCH before start is not needed and should be removed.

### Critical gaps

1. **No tracking API client** — nothing calls `start`, `location`, `complete`, or `route`.
2. **Commence ≠ tracking** — `components/operations/task-detail-modal.tsx` only does a status PATCH; no `TaskTrackingSession` is ever created.
3. **Complete ≠ tracking complete** — "Task Done" uses status PATCH; the backend `complete()` requires an **active session + proof files + final coordinates** or it returns 422.
4. **Tasks lack destination coords** — create task sends `location`/`address` text but not `latitude`/`longitude`; arrival detection depends on `task.latitude` / `task.longitude` being set.
5. **No WebSocket client** — map never subscribes to `tracking.*` events.
6. **No geolocation layer** — no permission prompt, watch, or offline buffer.
7. **Marker tags are static** — `map-view.tsx` hardcodes "Active at Kemsi Street" instead of real task/agent/address data.
8. **No staleness detection** — no handling for agents who go silent (poor signal, app backgrounded).
9. **Compact dashboard map** (`dashboard-map.tsx`) also shows mock data.

---

## Target Architecture

```
Agent Device
  ↓
[LocationPermissionGate]  ←  navigator.permissions + getCurrentPosition
  ↓
[Commence Task → POST /agent/tasks/{id}/start]
  ↓
[location-buffer.ts] ← watchPosition fires every ~10s
  ↓ flush every 30s (batch ≤ 50 points)
[POST /agent/tasks/{id}/location]
  ↓
Laravel API → Redis pub/sub
  ↓
WebSocket Relay (port 8081, nginx path /tracking-ws)
  ↓
Admin Map (Next.js)
  ↓
[store/tracking.ts] → [map-live-layer.tsx] → Mapbox GeoJSON setData()


Task lifecycle events:
  tracking.task.started
  tracking.location.updated   ← polyline grows, marker moves
  tracking.task.arrived       ← 75m radius auto-detected by backend
  tracking.task.completed     ← marker removed, route finalised
```

### Roles

- **Agent:** emits GPS via REST; opens map for own task only; WS filtered to own `user_id` by relay.
- **Management** (owner/admin/supervisor): map receives all company tracking events; can `GET /admin/tasks/{id}/route` for full history.

---

## Phase 0 — Align Contracts and Environment

**Effort:** 0.5 day

### Environment variables

Add to `.env.local`:

```bash
NEXT_PUBLIC_TRACKING_WS_URL=wss://<api-host>/tracking-ws
```

Dev uses the nginx proxy at `ws://localhost/tracking-ws`. Production uses the full `wss://` URL. Do **not** connect directly to port 8081 — always go through the nginx proxy path.

Existing vars that must be present:

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.thefactory23.com/api/v1
NEXT_PUBLIC_MAPBOX_TOKEN=pk...
```

### API path convention

Match existing `lib/api/tasks.ts` style but use **role-scoped paths** where middleware differs:

| Action | Agent path | Management path |
|--------|-----------|-----------------|
| Start tracking | `POST /agent/tasks/{id}/start` | N/A |
| Record location | `POST /agent/tasks/{id}/location` | N/A |
| Complete task | `POST /agent/tasks/{id}/complete` | N/A |
| Route (history/live) | `GET /agent/tasks/{id}/route` | `GET /admin/tasks/{id}/route` |
| List active tasks | `GET /agent/tasks?status=in_progress` | `GET /admin/tasks?status=in_progress` |

Generic `/api/v1/tasks/...` also exists; prefer scoped routes for clearer 403 behaviour.

---

## Phase 1 — Shared Foundation

**Effort:** 2–3 days

### 1.1 Types (`types/tracking.ts`) — new file

Model **task-centric** live state. Do not reuse the old `Agent[]` mock shape.

```typescript
export type TrackingEventType =
  | "tracking.task.started"
  | "tracking.location.updated"
  | "tracking.task.arrived"
  | "tracking.task.completed";

export interface LiveTaskState {
  taskId: number;
  trackingSessionId: number;
  userId: number;
  agentName: string;
  agentAvatarUrl?: string;
  taskTitle: string;
  taskAddress?: string;
  status: "in_progress" | "arrived" | "completed";
  destination?: { lat: number; lng: number; radiusM: number };
  lastPosition: [number, number]; // [lng, lat] — Mapbox convention
  polyline: [number, number][];   // capped at 2000 pts (drop oldest)
  lastEventAt: string;            // ISO — used for staleness check
  arrivedAt?: string;
}

export interface TrackingEnvelope {
  type: TrackingEventType;
  channel: string;
  payload: {
    task_id: number;
    tracking_session_id: number;
    user_id: number;
    company_id: number;
    occurred_at: string;
    data?: {
      latitude?: number;
      longitude?: number;
      accuracy_meters?: number;
      speed_mps?: number;
      heading_degrees?: number;
      event_type?: string;
      arrived?: boolean;
      task_status?: string;
    };
  };
}

export interface TrackingSession {
  id: number;
  task_id: number;
  started_by_user_id: number;
  start_latitude: number;
  start_longitude: number;
  arrival_detected_at: string | null;
  end_recorded_at: string | null;
}

export interface TaskRoute {
  task_id: number;
  company_id: number;
  status: string;
  destination: { latitude: number; longitude: number; radius_meters: number };
  start: { latitude: number; longitude: number; recorded_at: string };
  arrival: { latitude: number; longitude: number; recorded_at: string } | null;
  end: { latitude: number; longitude: number; recorded_at: string } | null;
  summary: { points_count: number; total_distance_meters: number };
  points: LocationPoint[];
  polyline: [number, number][];
}

export interface LocationPoint {
  latitude: number;
  longitude: number;
  accuracy_meters?: number;
  speed_mps?: number;
  heading_degrees?: number;
  event_type: "movement" | "start" | "arrival" | "complete";
  is_checkpoint: boolean;
  recorded_at: string;
}

export interface GeoReading {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedMps: number | null;
  headingDegrees: number | null;
  recordedAt: string; // ISO
}
```

---

### 1.2 API module (`lib/api/tracking.ts`) — new file

Follows the same `apiRequest` + `ApiEnvelope` pattern as `lib/api/tasks.ts`. Five exported functions:

**`startTaskTracking(taskId, payload, token)`**
- `POST /agent/tasks/{taskId}/start`
- Payload: `{ company_id, location_permission_granted: true, latitude, longitude, accuracy_meters, recorded_at }`
- Returns: `ApiEnvelope<{ task: TaskApiItem; tracking: TrackingSession; arrived: boolean }>`

**`recordTaskLocation(taskId, payload, token)`**
- `POST /agent/tasks/{taskId}/location`
- Supports single point **and** batch `points[]` array (max 50 per backend config)
- Single: `{ company_id, latitude, longitude, accuracy_meters, speed_mps, heading_degrees, recorded_at }`
- Batch: `{ company_id, points: [{ latitude, longitude, recorded_at, ... }] }`
- Returns: `ApiEnvelope<{ received_points: number; persisted_points: number; arrived: boolean }>`

**`completeTaskTracking(taskId, formData, token)`**
- `POST /agent/tasks/{taskId}/complete` with `multipart/form-data`
- Fields: `company_id`, `latitude`, `longitude`, `accuracy_meters`, `recorded_at`, `notes`, `files[]` (≥1 required)
- Uses raw `fetch` (not `apiRequest`) because of multipart — same pattern as `uploadTaskProof` in `tasks.ts`
- Returns: `ApiEnvelope<{ task: TaskApiItem; tracking: TrackingSession; proofs: ProofItem[] }>`

**`getTaskRoute(taskId, params, token)`**
- Agent: `GET /agent/tasks/{taskId}/route?company_id=X&include_points=true&limit=500`
- Management: `GET /admin/tasks/{taskId}/route?company_id=X&include_points=true&limit=500`
- Pass `role: 'agent' | 'management'` as a param to switch prefix
- Returns: `ApiEnvelope<TaskRoute>`

**`listAgentTasks(params, token)`**
- `GET /agent/tasks?company_id=X&status=pending` (or `in_progress`, `completed`)
- Returns assigned tasks for the authenticated agent
- Reuses `TaskApiItem` type from `tasks.ts`

Map all API errors via existing `ApiRequestError` and surface field-level `errors` to UI the same way `create-task-modal.tsx` does.

---

### 1.3 React Query hooks (`hooks/use-tracking.ts`) — new file

Thin wrappers around the API module. Keep mutation logic here; keep rendering logic in components.

- `useStartTracking()` — `useMutation`; on success invalidates `TASK_KEYS` so boards/lists update
- `useRecordLocation()` — `useMutation`; called by location buffer internally
- `useCompleteTracking()` — `useMutation`; on success invalidates `TASK_KEYS`
- `useTaskRoute(taskId, role)` — `useQuery`; key: `['tracking', 'route', taskId]`

---

### 1.4 Geolocation service (`lib/tracking/geolocation.ts`) — new file

Pure utility (no React dependency) so it can be called from the buffer module and from hooks alike.

```typescript
export async function requestLocationPermission(): Promise<PermissionState>;
// Uses navigator.permissions.query({ name: 'geolocation' }) — no prompt triggered.

export async function getCurrentPosition(options?: PositionOptions): Promise<GeoReading>;
// Calls navigator.geolocation.getCurrentPosition — triggers browser prompt if state is 'prompt'.
// Throws on denial or timeout.

export function watchPosition(
  onReading: (r: GeoReading) => void,
  onError: (e: GeolocationPositionError) => void,
  options?: PositionOptions
): () => void; // returns cleanup function (calls clearWatch internally)
```

**Quality gates applied before returning a reading:**
- Reject `accuracy > 200m` — too imprecise to persist
- Reject `(0, 0)` coords — GPS cold-start artefact
- Reject null `latitude`/`longitude`
- Use `enableHighAccuracy: true` while app is foregrounded; switch to `{ enableHighAccuracy: false, maximumAge: 30000 }` on `visibilitychange` (tab backgrounded) to reduce battery drain

---

### 1.5 Location buffer (`lib/tracking/location-buffer.ts`) — new file

Decoupled from React. Manages point queuing, batching, and flushing to the backend.

**Responsibilities:**
- Accepts `GeoReading` pushes from the geolocation watcher
- Queues readings in memory; optionally snapshots to `sessionStorage` on `visibilitychange` / `beforeunload` for recovery after accidental refresh
- Flushes as a **batch** every 30–60 seconds, or when queue reaches 5 points (whichever comes first)
- Respects the backend's 50-point max batch limit
- On flush, calls `recordTaskLocation(taskId, { company_id, points: [...] }, token)`
- On `arrived: true` in the response, fires an `onArrived` callback
- On network failure, retains points and retries on next flush cycle
- On `navigator.onLine` recovery, immediately flushes backlog
- Caps queue at 50 points to bound memory; on overflow, drops oldest (server already applies 15s/20m persistence filter anyway)
- Exposes `start(taskId, companyId, token, callbacks)` and `stop()` methods

---

### 1.6 Tracking store (`store/tracking.ts`) — new file

Zustand store. **No persistence** — tracking state is runtime only.

```typescript
interface TrackingStore {
  // Keyed by task_id
  liveTasks: Record<number, LiveTaskState>;

  // WebSocket connection state
  wsStatus: "idle" | "connecting" | "connected" | "reconnecting" | "error";

  // Currently selected task in map sidebar
  selectedTaskId: number | null;

  // Agent-side: which task is actively being tracked on this device
  activeTrackingTaskId: number | null;

  // Actions
  upsertFromWs(envelope: TrackingEnvelope): void;
  hydrateFromRoute(taskId: number, routeData: TaskRoute, taskMeta: TaskApiItem): void;
  hydrateBatch(entries: LiveTaskState[]): void;
  appendPolylinePoint(taskId: number, point: [number, number]): void;
  markArrived(taskId: number, arrivedAt: string): void;
  markCompleted(taskId: number): void;
  removeTask(taskId: number): void;
  setSelectedTask(taskId: number | null): void;
  setActiveTrackingTask(taskId: number | null): void;
  setWsStatus(status: TrackingStore["wsStatus"]): void;
}
```

**`upsertFromWs` routing logic:**

| `envelope.type` | Store action |
|---|---|
| `tracking.task.started` | `upsertTask` with status `in_progress`, set `lastPosition`, `trackingSessionId` |
| `tracking.location.updated` | `appendPolylinePoint` + update `lastPosition`, `lastEventAt`; if `data.arrived` also call `markArrived` |
| `tracking.task.arrived` | `markArrived(taskId, occurred_at)` |
| `tracking.task.completed` | `markCompleted(taskId)`; after 5s delay call `removeTask(taskId)` |

`appendPolylinePoint` caps the polyline array at 2000 entries (removes oldest) to prevent unbounded memory growth during long shifts.

---

### 1.7 WebSocket hook (`hooks/use-tracking-ws.ts`) — new file

Manages the WebSocket connection and feeds the store.

**Connect:**

```typescript
const wsUrl = `${process.env.NEXT_PUBLIC_TRACKING_WS_URL}?token=${encodeURIComponent(token)}&company_id=${companyId}`;
const ws = new WebSocket(wsUrl);
```

Post-connect auth message is also sent immediately after open as a backup (relay supports both):
```typescript
ws.send(JSON.stringify({ type: "authenticate", token, company_id: companyId }));
```

**Handle incoming messages:**

- `system.connected` — set `wsStatus = 'connected'`; re-hydrate in-progress tasks via REST (WS may have missed events during reconnect gap)
- `system.auth_required` — send authenticate message
- `tracking.task.started` | `.location.updated` | `.task.arrived` | `.task.completed` → `store.upsertFromWs(envelope)`
- `pong` — update heartbeat timestamp

**Reconnection:**
- Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s cap
- On each successful reconnect: re-hydrate all `liveTasks` entries still `in_progress` via `getTaskRoute`

**Polling fallback:**
- If `wsStatus !== 'connected'` for > 30 seconds while `liveTasks` has active entries:
  - Poll `getTaskRoute` for each active task every 25 seconds
  - Stop polling when `wsStatus` returns to `'connected'`
  - Stop per-task polling when task reaches `completed` or `cancelled`

**Cleanup:** On unmount, `ws.close()`, clear backoff timer, clear poll intervals. Do **not** persist raw WS messages or tokens to browser logs.

---

## Phase 2 — Agent Workflow

**Effort:** 3–4 days

This is the critical path. Without it the map has nothing real to show.

### 2.1 Fix "Commence Task" in `components/operations/task-detail-modal.tsx` — MODIFY EXISTING

This is the highest-priority change. The current handler only calls `updateTaskStatus('in_progress')`. Replace it entirely with `handleCommenceAndTrack`:

**New flow:**

1. Confirm task is `pending` or `in_progress` and current user is the assigned agent.
2. Show `LocationPermissionGate` (inline step or modal step — see 2.2).
3. On permission granted: call `getCurrentPosition()` → `GeoReading`.
4. Call `startTaskTracking(taskId, { company_id, location_permission_granted: true, latitude, longitude, accuracy_meters, recorded_at }, token)`.
5. On success:
   - Call `locationBuffer.start(taskId, companyId, token, { onArrived })` to begin the watch + flush loop.
   - Store `trackingSessionId` via `store.setActiveTrackingTask(taskId)`.
   - Toast: "Tracking started." If `arrived: true` in response, immediately show "You've arrived at the destination."
6. On 422: map `errors` fields to inline form errors (assignment mismatch, permission not granted, already active session).

**Remove** the standalone `updateTaskStatus('in_progress')` call that previously ran before this — `TaskTrackingService::start()` already handles the `pending → in_progress` transition.

### 2.2 Location permission gate (`components/tracking/LocationPermissionGate.tsx`) — new file

Our own explainer that appears **before** the browser's native prompt, giving the user context so they don't blindly deny.

**Logic on mount:**

1. Call `requestLocationPermission()` — reads `navigator.permissions.query`. No prompt fired yet.
2. **If `denied`:** Show "Location Blocked" screen. Detect browser via `navigator.userAgent` and show Chrome-specific or Safari-specific instructions to re-enable location in settings. No Start button — user must fix it in the browser first.
3. **If `prompt`:** Show explanation card:
   - Icon: location pin
   - Heading: "Location access needed"
   - Body: "To begin this task, we'll track your location so supervisors can monitor your route and confirm arrival. Location sharing stops the moment you complete or cancel the task."
   - Battery impact note: "Continuous GPS uses some battery."
   - "Allow Location" button → calls `getCurrentPosition()` which triggers the real browser prompt
   - "Not Now" button → cancels the commence flow, stays on task detail
4. **If `granted`:** Skip the card entirely. Call `getCurrentPosition()` silently and proceed.

### 2.3 Active tracking provider (`components/tracking/active-tracking-provider.tsx`) — new file

A React context provider mounted under `app/agent/layout.tsx`. Survives navigation between agent dashboard, map, task modal, etc.

**Responsibilities:**
- Holds reference to the `locationBuffer` instance for the active task
- Exposes `startTracking(taskId)` and `stopTracking()` to consumers
- Prevents starting a second task if one is already active (shows "Complete your current task first")
- Cleans up the buffer and geolocation watcher on unmount or token expiry

### 2.4 Persistent tracking bar (`components/tracking/ActiveTrackingBar.tsx`) — new file

Fixed bar rendered just above the agent nav whenever `store.activeTrackingTaskId` is set. Keeps the tracking visible as the agent navigates.

- Shows: task title (truncated), pulsing red "● Tracking" dot, elapsed time since start
- Tap → navigates to `app/agent/tasks/[id]/tracking`
- "Stop" icon → prompts confirmation before stopping the tracker

The `locationBuffer` lives inside `ActiveTrackingProvider`, not in the tracking page. This ensures location keeps uploading even when the agent navigates away from the tracking page.

### 2.5 Agent task pages — new files

**`app/agent/tasks/page.tsx`**
- Three-tab layout: Pending / In Progress / Completed
- React Query per tab, each cached independently
- Task card: title, address, due date badge (red if overdue), priority badge, action button
- Action buttons: Pending → "Start", In Progress → "Continue", Completed → "View"
- Start/Continue → navigates to `app/agent/tasks/[id]/tracking`

**`app/agent/tasks/[id]/page.tsx`**
- Reads `taskId` from params, calls `getTask`
- Task header: title, priority, status
- Details card: description, due date, assignor, required actions checklist
- Location card: address + small static Mapbox mini-map (`interactive: false`) centered on destination coords
- Bottom action bar: same contextual button as the list card

**`app/agent/tasks/[id]/tracking/page.tsx`**

Three phases in sequence on the same page:

_Phase A — Permission + pre-start:_
- Shows `LocationPermissionGate`
- Once granted: shows "Ready to Start" confirmation with initial position on mini-map
- "Begin Task" button → calls `handleCommenceAndTrack`

_Phase B — Active tracking:_
Shown after `startTaskTracking` succeeds.
- Full-screen Mapbox map centered on agent's current position
- Live pulsing dot at agent position, destination pin, 75m arrival radius circle
- Top overlay: task title, elapsed time
- GPS accuracy badge ("±8m")
- "Arrived" banner slides in on `tracking.task.arrived` or when `arrived: true` in location response
- Bottom: "Complete Task" button (enabled on arrival; also overrideable after 30-min timeout for edge cases)

_Phase C — Completion sheet:_
- `CompleteTaskSheet` slides up from bottom
- File picker / camera capture — minimum photos from `task.minimum_photos_required`
- Image preview grid (3 columns) with individual remove buttons
- Notes text area (optional)
- "Submit" button → calls `completeTaskTracking` with FormData
- On success: stops buffer, clears active session, navigates to task list with success toast

### 2.6 Complete task sheet (`components/tracking/CompleteTaskSheet.tsx`) — new file

- Accepts `taskId`, `companyId`, `minimumPhotos`, `onSuccess`, `onClose`
- Validates file count before enabling submit
- Calls `getCurrentPosition()` for final coordinates
- Builds `FormData` with all fields
- On 422: surfaces errors inline
- On success: calls `onSuccess`, caller stops the buffer and watcher

### 2.7 Fix "Task Done" in `task-detail-modal.tsx` — MODIFY EXISTING

The current "Task Done" button calls `updateTaskStatus('completed')` directly. Replace with the completion flow above. Keep "Cancel Task" as a status PATCH only (no tracking session required for cancel).

### 2.8 Agent map page update (`app/agent/map/page.tsx`) — MODIFY EXISTING

- If `store.activeTrackingTaskId` is set: center map on agent's last known position, show own polyline and 75m destination circle
- If no active session: show "No active tracking" state + link to tasks
- Do **not** show other agents (relay filters them anyway for agent role)

### 2.9 Arrival UX

Backend auto-publishes `tracking.task.arrived` when agent enters the 75m radius. Agent UI should respond to either:
- The WS `tracking.task.arrived` event hitting `upsertFromWs`
- The `arrived: true` flag in any `recordTaskLocation` response

On arrival: show non-blocking "You've arrived at the destination" banner. Enable the "Complete Task" button if it was previously disabled.

---

## Phase 3 — Management Map

**Effort:** 3–4 days

Refactor `map-view.tsx` into composable pieces while preserving all current UI (sidebar search, agent list, popup tags).

### 3.1 File split

```
components/map/
  map-view.tsx               # shell — mounts sub-components, connects WS
  map-canvas.tsx             # Mapbox init, GeoJSON sources, layers
  map-live-layer.tsx         # real-time source updates from store
  map-agent-marker.tsx       # createMarkerEl using real task/agent data
  map-sidebar.tsx            # search + agent list feed from store
  map-task-panel.tsx         # popup panel (agent, task, status, last seen, distance)
```

### 3.2 Hydration on mount (REST before WS)

1. Read `companyId` + token from `useAuthStore` / `getActiveCompanyContext`.
2. `GET /admin/tasks?status=in_progress&company_id=X` to get all active tasks.
3. For each task with an assignee + destination coords, seed a `liveTasks` entry (position unknown until WS/route arrives).
4. Parallel-fetch routes for all visible tasks: `GET /admin/tasks/{id}/route?include_points=true&limit=500` — builds initial polylines.
5. Connect WebSocket; merge incoming deltas from that point on.

### 3.3 Replace dummy agents with live task markers

Key markers by **`taskId`**, not agent ID (one marker per actively tracked task). Marker tag content:

| Tag field | Source |
|-----------|--------|
| Name | `assignee.name` or `assigned_users[0].name` |
| Subtitle | `task.title` or `task.address` |
| Status chip | `in_progress` / `arrived` / stale (no update > 2 min) |
| Avatar | `assignee` avatar URL if available |

**Remove** the `setInterval` jitter entirely.

### 3.4 Mapbox GeoJSON layers

Use GeoJSON sources for performance (scalable vs many individual HTML markers):

| Source ID | Type | Contents |
|-----------|------|----------|
| `live-positions` | FeatureCollection | One Point per active task (latest `lastPosition`), agent metadata in feature properties |
| `live-routes` | FeatureCollection | One LineString per active task (full `polyline` array) |
| `task-destinations` | FeatureCollection | One Point per active task destination |

| Layer ID | Type | Purpose |
|----------|------|---------|
| `agent-circles` | circle | Agent dot — color by status: blue=in_progress, green=arrived, grey=stale |
| `agent-labels` | symbol | Agent name text above dot |
| `route-lines` | line | Route trace — solid blue=active, green=arrived, dashed grey=completed |
| `destination-pins` | symbol | Purple destination marker icon |
| `arrival-zones` | circle | Semi-transparent circle at 75m radius around destination |
| `checkpoint-symbols` | symbol | Start/arrival/end checkpoint icons (loaded from route API when task selected) |

Update all sources inside `requestAnimationFrame` to batch GPU updates and avoid tearing when event rate is high.

### 3.5 Smooth marker movement

For ≤ ~20 concurrent agents: keep HTML markers and lerp position over ~800ms on each `tracking.location.updated` event (smooth visual movement between GPS readings).

For > 20 agents: switch fully to symbol layers and `setData()` — GPU-side update, no DOM overhead.

### 3.6 Agent click → selection + panel

Sidebar row click or `agent-circles` layer click:
- `store.setSelectedTask(taskId)`
- `map.flyTo({ center: lastPosition, zoom: 15 })`
- `map-task-panel.tsx` shows: agent name, avatar, task title, address, last seen (relative time from `lastEventAt`), arrival badge, total distance from route summary

### 3.7 Compact dashboard map (`components/dashboard/dashboard-map.tsx`) — MODIFY EXISTING

Currently passes mock data. Update to:
- Connect to the same `store/tracking.ts`
- If the tracking store has active entries: render real markers in compact mode
- If empty: show "No active tracking" placeholder instead of mock jitter

---

## Phase 4 — Task Creation & Destination Coords

**Effort:** 1–2 days

Tracking is only as good as `task.latitude` / `task.longitude`. Currently these are almost always null.

### 4.1 Geocode on create (`components/operations/create-task-modal.tsx`) — MODIFY EXISTING

When admin/supervisor enters `location` + `address`:
- On address field blur (or on submit if no geocode cached), call **Mapbox Geocoding API** (token already in env)
- Endpoint: `https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json?access_token=TOKEN&country=NG&limit=1`
- On success: populate hidden `latitude` / `longitude` fields in the form
- Show a small pin-preview mini-map so the user can confirm the geocoded point
- Include `latitude` and `longitude` in the `createTask` payload (fields already exist on `CreateTaskPayload` in `tasks.ts`)

### 4.2 Validation

- If `visit_verification_required === true`: require coordinates before allowing save (arrival detection depends on them)
- If geocoding fails or returns no result: warn ("Could not determine coordinates — arrival detection won't work") but allow save with text-only location

### 4.3 Task detail map header (`task-detail-modal.tsx`) — MODIFY EXISTING

Replace the current static SVG placeholder with:
- Small interactive Mapbox map centered on destination coords (if available)
- After tracking starts, fetch `useTaskRoute(taskId)` and overlay the live polyline + checkpoint markers
- If no coords: show "No location set" with an "Add coordinates" edit action

---

## Phase 5 — Marker Tags, Status, and Staleness

**Effort:** 1 day

Tags = the white label chips on markers and sidebar rows.

### Status rules

| State | Visual |
|-------|--------|
| Active / moving | Green ring on marker, subtitle: "En route · {task title}" |
| Arrived | Purple pulse (already in design), marker chip: "Arrived" |
| Stale (> 2 min no update) | Grey marker, subtitle: "Last seen {relative time from `lastEventAt`}" |
| Completed | Remove from live layer; optionally show grey historical marker briefly |

### Implementation

Run a **30-second interval** in `map-view.tsx` shell to re-evaluate all `liveTasks` entries and downgrade any with `lastEventAt` more than 2 minutes ago to `stale` visual state. This runs client-side without any API call or WS traffic.

On `tracking.location.updated` events: reset the stale timer for that task.

---

## Phase 6 — Route History

**Effort:** 1–2 days

### `components/map/RouteHistoryPanel.tsx` — new file

Side drawer, shown when a management user clicks a completed task entry.

- Calls `getTaskRoute(taskId, { company_id, role: 'management' }, token)`
- Renders full route polyline on the map (separate source, doesn't disturb live data)
- Checkpoint markers:
  - Green circle = start
  - Yellow circle = arrival
  - Red circle = completion
- Stats bar: total distance, duration (end − start), average speed
- "Replay" button (optional): animates a marker along the polyline at 2× speed
- "Close" button: removes panel and route overlay, returns to live view

### Historical route access

- Management: `GET /admin/tasks/{id}/route`
- Agents: `GET /agent/tasks/{id}/route` (own tasks only, relay enforces)

---

## Phase 7 — Security, Errors, and Edge Cases

| Scenario | Handling |
|----------|----------|
| `401` on API or WS | Refresh session or redirect to login; tear down geolocation watcher and buffer |
| `403` not assigned | Toast "This task is not assigned to you"; do not start watcher |
| `422` location permission not granted | Re-show `LocationPermissionGate` |
| `422` session already active | Resume watcher from `activeTrackingTaskId`; or prompt to complete the other task first |
| GPS denied mid-task | Pause uploads; persistent banner "Location access lost — tap to re-enable"; retry permission on banner tap |
| Tab backgrounded | `visibilitychange` → reduce `watchPosition` accuracy to save battery; buffer accumulates; flush still runs on interval |
| Task reassigned while tracking | Backend blocks further location points with 422; UI should stop watcher and show "Task was reassigned" |
| Redis / WS down | REST still records agent path; map uses polling fallback (Phase 1.7) |
| Poor GPS accuracy (> 200m) | Skip point client-side in geolocation.ts before pushing to buffer |
| `(0, 0)` coordinates | Reject in `geolocation.ts` quality gate — GPS cold-start artefact |
| Accidental page refresh during tracking | `sessionStorage` snapshot from `location-buffer.ts` restores queued points; `activeTrackingTaskId` lost (not persisted); agent sees "Resume tracking?" prompt on next task open |
| Network offline | Buffer accumulates; flush on `navigator.onLine` recovery event |
| Clock skew | Always include `recorded_at` from client (`new Date().toISOString()`); backend uses server time for final ordering when client time is unreasonable |

**Token on WebSocket:** prefer post-connect `{ type: "authenticate", token, company_id }` message in production. Query param (`?token=...`) is acceptable behind nginx in dev. Never log raw WS messages containing auth context.

---

## Phase 8 — Testing Plan

### Manual E2E checklist

1. Admin creates task with address → geocoded pin appears on mini-map → `latitude`/`longitude` saved.
2. Admin assigns task to agent.
3. Agent opens task → Commence → `LocationPermissionGate` shown → browser prompt fires → permission granted.
4. `POST /start` succeeds → tracking indicator appears in `ActiveTrackingBar`.
5. Agent navigates away from tracking page → `ActiveTrackingBar` still visible → location still uploading.
6. Admin map: agent marker appears, polyline grows, tag shows agent name + task title.
7. Agent walks near destination (or simulate coords via browser devtools) → "Arrived" banner on agent UI → map marker turns green.
8. Agent uploads proof photo(s) + completes → `POST /complete` succeeds → agent sees success toast.
9. Admin map: marker disappears; task moves to completed column.
10. Admin opens route history panel → full polyline + start/arrival/end checkpoints visible.
11. Disconnect network mid-task → buffer accumulates → reconnect → backlog flushes → polyline catches up.
12. Close browser tab mid-task → reopen → `sessionStorage` point recovery works.

### Automated tests

**Unit:**
- `location-buffer.ts`: flush timing, 50-point cap, offline retry
- `store/tracking.ts`: `upsertFromWs` reducer for all 4 event types; polyline cap at 2000 pts
- Stale detection: `lastEventAt` > 2 min → correct status downgrade

**Integration:**
- Mock `apiRequest` + simulate WS message sequence → assert store state snapshots
- `LocationPermissionGate`: mock `navigator.permissions` states (denied / prompt / granted) → assert correct branch renders

**Contract:**
- Type shapes in `types/tracking.ts` should match backend fixture responses from `backend/src/tests/Feature/Task/TaskTrackingTest.php`

---

## Recommended Implementation Order

| Week | Deliverable | Why |
|------|-------------|-----|
| 1 | `lib/api/tracking.ts`, `types/tracking.ts`, fix Commence → `startTaskTracking`, fix "Task Done" → `completeTaskTracking` | Tracking sessions start existing immediately; unblocks everything |
| 2 | Geolocation service + buffer, `LocationPermissionGate`, active tracking provider + `ActiveTrackingBar` | Agent can track continuously; foundation for WS |
| 3 | `store/tracking.ts`, `hooks/use-tracking-ws.ts`, map hydration on mount | WS feeds store; admin map gets real data |
| 4 | Map file split, GeoJSON layers, real marker tags, staleness, `dashboard-map.tsx` update | Full dashboard visibility |
| 5 | Task geocoding in create-task-modal, task detail mini-map, route history panel, polling fallback, QA | End-to-end completeness + hardening |

Each week is independently shippable. Week 1 alone makes agent tracking real, even before the admin map moves.

---

## Full File Changelist

| File | Action | Notes |
|------|--------|-------|
| `.env.local` | Modify | Add `NEXT_PUBLIC_TRACKING_WS_URL` |
| `types/tracking.ts` | Create | Shared types: `LiveTaskState`, `TrackingEnvelope`, `TaskRoute`, `GeoReading`, etc. |
| `lib/api/tracking.ts` | Create | 5 API functions following `apiRequest` pattern |
| `hooks/use-tracking.ts` | Create | React Query wrappers: `useStartTracking`, `useCompleteTracking`, `useTaskRoute` |
| `lib/tracking/geolocation.ts` | Create | Pure browser Geolocation wrapper with quality gates |
| `lib/tracking/location-buffer.ts` | Create | Queue, batch-flush, offline recovery |
| `store/tracking.ts` | Create | Zustand live-tracking store |
| `hooks/use-tracking-ws.ts` | Create | WebSocket client, reconnect backoff, polling fallback |
| `components/tracking/LocationPermissionGate.tsx` | Create | Explainer UI + denied fallback with browser-specific instructions |
| `components/tracking/active-tracking-provider.tsx` | Create | Context provider mounted in agent layout |
| `components/tracking/ActiveTrackingBar.tsx` | Create | Persistent tracking indicator bar |
| `components/tracking/CompleteTaskSheet.tsx` | Create | Proof upload + notes + submit for completion |
| `app/agent/tasks/page.tsx` | Create | Agent task list (Pending / In Progress / Completed tabs) |
| `app/agent/tasks/[id]/page.tsx` | Create | Task detail with static mini-map |
| `app/agent/tasks/[id]/tracking/page.tsx` | Create | Active tracking screen (3 phases) |
| `app/agent/map/page.tsx` | Modify | Show own route / session if active; "no active tracking" state if not |
| `app/agent/layout.tsx` | Modify | Mount `ActiveTrackingProvider` + `ActiveTrackingBar` |
| `components/operations/task-detail-modal.tsx` | Modify | Commence → `handleCommenceAndTrack`; Task Done → `completeTaskTracking` |
| `components/operations/create-task-modal.tsx` | Modify | Add Mapbox geocoding → populate `latitude`/`longitude` on task create |
| `components/map/map-view.tsx` | Modify | Remove demo data; becomes shell mounting sub-components |
| `components/map/map-canvas.tsx` | Create | Mapbox init, GeoJSON source + layer declarations |
| `components/map/map-live-layer.tsx` | Create | Subscribes to store, calls `setData()` via `requestAnimationFrame` |
| `components/map/map-agent-marker.tsx` | Modify | `createMarkerEl` uses real `LiveTaskState` instead of hardcoded `Agent` |
| `components/map/map-sidebar.tsx` | Create | Agent list fed from `store.liveTasks` |
| `components/map/map-task-panel.tsx` | Create | Popup panel with real task/agent/status data |
| `components/map/RouteHistoryPanel.tsx` | Create | Historical route drawer for management |
| `components/dashboard/dashboard-map.tsx` | Modify | Feed real store data instead of mock jitter |

---

## Design Decision: One "Commence" Button

Treat **Commence Task** as **"Start task & share live location"**, not a separate status toggle:

```
[Commence Task]
  → LocationPermissionGate
  → POST /agent/tasks/{id}/start  ← also transitions pending → in_progress
  → location-buffer.start(taskId)
  → ActiveTrackingBar appears
  → UI: In Progress + tracking indicator
```

This matches the backend design: `TaskTrackingService::start()` handles the status transition. The current two-step approach (`updateTaskStatus('in_progress')` then a separate start) leaves tasks in `in_progress` with **no active `TaskTrackingSession`**, which means `completeTaskTracking` will always fail with "Tracking session is not active." Fixing Commence is the first thing to do.

---

*Related docs: `TRACKING_SYSTEM_ARCHITECTURE_REVIEW.md` · `api docs/frontend-guide/task-tracking-realtime.md` · `api docs/features/task-tracking-realtime.md`*
*Do NOT follow: `api docs/features/map-live-tracking.md` · `docs/map-realtime-tracking-plan.md` (Reverb/Socket.IO — stale spec)*
