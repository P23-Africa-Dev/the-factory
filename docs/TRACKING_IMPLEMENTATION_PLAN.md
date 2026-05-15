# Live Task Tracking — Implementation Plan

## Overview of What Exists vs What's Needed

**Existing (working):**
- Mapbox map initialized in `components/map/map-view.tsx` with custom HTML markers and demo animation
- Auth token via `factory_auth_token` cookie, company ID via `useAuthStore`
- `apiRequest` utility in `lib/api/onboarding.ts` with consistent envelope pattern
- Agent layout at `app/agent/layout.tsx`
- Task types and CRUD in `lib/api/tasks.ts`

**Must be built:**
- Tracking API service (`lib/api/tracking.ts`)
- Tracking Zustand store (`store/tracking.ts`)
- WebSocket client hook (`hooks/use-tracking-ws.ts`)
- Geolocation hook (`hooks/use-geolocation.ts`)
- Location reporter hook for agents (`hooks/use-location-reporter.ts`)
- Agent task tracking pages under `app/agent/tasks/`
- Location permission UI components
- Dashboard map upgrade to consume real WebSocket data

---

## New Environment Variable

Add to `.env.local`:
```
NEXT_PUBLIC_WS_URL=wss://realtime.thefactory23.com
```

---

## Phase 1 — Foundation Layer

### `lib/api/tracking.ts` (new file)

Follows the same `apiRequest` pattern as `tasks.ts`. Provides five functions:

**`listAgentTasks(params, token)`**
- `GET /agent/tasks?company_id=X&status=pending&status=in_progress`
- Returns assigned tasks for the authenticated agent
- Reuses `TaskApiItem` type from `tasks.ts`

**`startTask(taskId, payload, token)`**
- `POST /agent/tasks/{taskId}/start`
- Payload: `{ company_id, location_permission_granted: true, latitude, longitude, accuracy_meters, recorded_at }`
- Returns: `{ task, tracking: TrackingSession, arrived: boolean }`

**`recordLocation(taskId, payload, token)`**
- `POST /agent/tasks/{taskId}/location`
- Supports both single point and batch: `{ company_id, points: [...] }` or `{ company_id, latitude, longitude, ... }`
- Returns: `{ received_points, persisted_points, arrived }`

**`completeTask(taskId, formData, token)`**
- `POST /agent/tasks/{taskId}/complete` with `multipart/form-data`
- Fields: `company_id`, `latitude`, `longitude`, `accuracy_meters`, `recorded_at`, `notes`, `files[]`
- Returns: `{ task, tracking, proofs }`
- Uses raw `fetch` like the existing `uploadTaskProof` (not `apiRequest`) because of multipart

**`getTaskRoute(taskId, params, token)`**
- `GET /agent/tasks/{taskId}/route?company_id=X` (agent) or `/admin/tasks/{taskId}/route` (management)
- Returns: `{ task_id, destination, start, arrival, end, summary, points, polyline }`
- `polyline` is `[lng, lat][]` ready for Mapbox

**Types to define in this file:**

```typescript
TrackingSession = {
  id: number
  task_id: number
  started_by_user_id: number
  start_latitude: number
  start_longitude: number
  arrival_detected_at: string | null
  end_recorded_at: string | null
}

TaskRoute = {
  task_id: number
  company_id: number
  status: string
  destination: { latitude: number; longitude: number; radius_meters: number }
  start: { latitude: number; longitude: number; recorded_at: string }
  arrival: { latitude: number; longitude: number; recorded_at: string } | null
  end: { latitude: number; longitude: number; recorded_at: string } | null
  summary: { points_count: number; total_distance_meters: number }
  points: LocationPoint[]
  polyline: [number, number][]
}

LocationPoint = {
  latitude: number
  longitude: number
  event_type: 'movement' | 'start' | 'arrival' | 'complete'
  is_checkpoint: boolean
  recorded_at: string
}
```

---

### `store/tracking.ts` (new file)

A Zustand store (no persistence — tracking state is ephemeral). Sits alongside the existing `store/auth.ts`.

```typescript
interface LiveTaskState {
  taskId: number
  trackingSessionId: number | null
  agentId: number
  agentName: string
  agentAvatar: string | null
  lastPosition: [lng: number, lat: number] | null
  polyline: [lng: number, lat: number][]       // ordered route so far
  status: 'tracking' | 'arrived' | 'completed'
  arrivedAt: string | null
  lastUpdatedAt: string | null
  destination: { lat: number; lng: number; radiusMeters: number } | null
}

interface TrackingStore {
  liveTaskMap: Record<number, LiveTaskState>   // keyed by task_id
  wsStatus: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

  // called by WS hook on each event
  upsertTask(taskId: number, partial: Partial<LiveTaskState>): void
  appendPolylinePoint(taskId: number, point: [number, number]): void
  markArrived(taskId: number, arrivedAt: string): void
  markCompleted(taskId: number): void
  removeTask(taskId: number): void

  // called when dashboard opens — hydrates from route API
  hydrateTasks(tasks: LiveTaskState[]): void

  setWsStatus(status: TrackingStore['wsStatus']): void
}
```

- `upsertTask` merges into existing entry if it exists, creates it if not.
- `appendPolylinePoint` caps the polyline at 2000 points (removes oldest) to avoid memory growth during long shifts.

---

### `hooks/use-geolocation.ts` (new file)

Wraps `navigator.geolocation` for both one-shot and continuous use. No tracking logic — just location reading.

```typescript
interface GeolocationState {
  permissionState: 'unknown' | 'prompt' | 'granted' | 'denied'
  position: GeolocationCoordinates | null   // lat, lng, accuracy, speed, heading
  error: GeolocationPositionError | null
  isWatching: boolean
}

interface GeolocationActions {
  checkPermission(): Promise<PermissionState>
  requestOnce(): Promise<GeolocationCoordinates>  // triggers browser prompt if needed
  startWatching(onUpdate: (coords: GeolocationCoordinates) => void): void
  stopWatching(): void
}
```

**Implementation notes:**
- `checkPermission` uses `navigator.permissions.query({ name: 'geolocation' })` — does NOT trigger a prompt
- `requestOnce` calls `navigator.geolocation.getCurrentPosition` with `{ enableHighAccuracy: true, timeout: 10000 }`. This is the call that triggers the browser's native permission prompt if state is `'prompt'`
- `startWatching` calls `navigator.geolocation.watchPosition` with `{ enableHighAccuracy: true, maximumAge: 5000 }`. Stores the watch ID in a ref for cleanup
- On unmount or `stopWatching`: calls `clearWatch(watchId)`
- Handles `code === 1` (PERMISSION_DENIED) by setting `permissionState: 'denied'`

---

### `hooks/use-tracking-ws.ts` (new file)

Manages the WebSocket connection to `wss://realtime.thefactory23.com`. Reads `token` and `companyId` from `useAuthStore`. Updates `useTrackingStore` on each event.

**Connection lifecycle:**
1. On mount: creates `WebSocket` with `?token=TOKEN&company_id=COMPANY_ID` in URL
2. `onopen`: sets store `wsStatus = 'connected'`, sends `{ type: "ping" }` to verify
3. `onmessage`: parses event, dispatches to store handlers (see below)
4. `onerror` / `onclose`: sets `wsStatus = 'reconnecting'`, schedules retry with backoff starting at 1s, doubling to max 30s
5. On unmount: closes socket, clears retry timer

**Message routing (inside `onmessage`):**

| Event type | Store action |
|---|---|
| `tracking.task.started` | `upsertTask(id, { status: 'tracking', lastPosition, trackingSessionId })` |
| `tracking.location.updated` | `appendPolylinePoint(id, [lng, lat])` + `upsertTask(id, { lastPosition, lastUpdatedAt })` — if `payload.data.arrived` also call `markArrived` |
| `tracking.task.arrived` | `markArrived(id, occurred_at)` |
| `tracking.task.completed` | `markCompleted(id)` then after 5s delay → `removeTask(id)` |

**Polling fallback:**
If `wsStatus !== 'connected'` for more than 30 seconds while there are active tasks, the hook polls `getTaskRoute` every 25 seconds for each active task and hydrates the store. Polling stops when `wsStatus` returns to `'connected'`.

---

### `hooks/use-location-reporter.ts` (new file)

Used only on the agent side. Collects location updates from the Geolocation API and sends them to the backend in batches.

```typescript
interface LocationReporterOptions {
  taskId: number
  companyId: number
  token: string
  active: boolean   // set to false to pause/stop reporting
  onArrived?: () => void
}
```

**Behavior:**
- Maintains an internal queue of `GeolocationCoordinates` objects
- Every time the geolocation watcher fires a new position, it appends to the queue
- Every 30 seconds, if the queue has any entries (max 50 per the API contract): flushes the queue with `recordLocation(taskId, { company_id, points: [...] }, token)`
- On `arrived: true` in the response: fires the `onArrived` callback
- On network failure: retains queued points and retries on next flush cycle (queue capped at 100 to limit memory)
- When `active` becomes `false`: stops the flush interval and the geolocation watcher

---

## Phase 2 — Agent Task Flow

### `app/agent/tasks/page.tsx` (new)

**Layout:** Tab bar with three filters — "Pending", "In Progress", "Completed". Default tab: "Pending".

**Data fetching:** React Query `useQuery` to call `listAgentTasks({ company_id, status }, token)`. Separate queries per tab so each caches independently.

**Task card design:**
- Title (bold), address/location below
- Due date badge (red if overdue)
- Priority badge (color-coded)
- Status chip
- Right-side action button:
  - Pending → "Start" (green, outlined)
  - In Progress → "Continue" (blue, filled)
  - Completed → "View" (gray)
- Clicking Start or Continue navigates to `app/agent/tasks/[id]/tracking`

---

### `app/agent/tasks/[id]/page.tsx` (new)

Task detail view. Reads `taskId` from params, fetches task with `getTask`.

**Sections:**
1. Task header: title, priority badge, status
2. Details card: description, due date, assigned by, required actions checklist
3. Location card: address text + static mini-map showing the destination pin (small non-interactive Mapbox map, `interactive: false`)
4. Action bar at bottom: "Start" / "Continue" / "View" button matching status

---

### `app/agent/tasks/[id]/tracking/page.tsx` (new)

The core agent experience. Three phases rendered sequentially in the same page:

**Phase A — Pre-start (permission check):**
Rendered when task status is `pending` or `in_progress` but no active tracking in progress on this device.
- Shows the `LocationPermissionGate` component (see below)
- Once permission granted: shows a "Start Tracking" confirmation screen with initial position on map

**Phase B — Active tracking:**
Shown after `startTask` succeeds.
- Full-screen mini-map centered on current position with destination pin
- Top overlay: task title, elapsed time counter
- GPS accuracy badge (e.g., "±8m accuracy")
- Animated pulsing dot at current agent position
- Destination radius circle (75m) rendered on map
- "Arrived" banner slides in automatically when `arrived: true` comes back from `recordLocation`
- Bottom action bar: "Complete Task" button (disabled until arrived, or overrideable after 30-min timeout as fallback)

**Phase C — Completion flow:**
- Modal sheet that slides up from bottom
- File picker / camera capture for proof images (at least 1 required)
- Image previews shown in a 3-column grid
- Notes text area (optional)
- "Submit" button — calls `completeTask` with FormData
- On success: navigates back to task list with a success toast

---

### `components/tracking/LocationPermissionGate.tsx` (new)

Our own UI that appears before we ever call the Geolocation API. Gives users context before the browser prompt fires.

**Logic flow:**
1. On mount, call `useGeolocation().checkPermission()` (no browser prompt triggered)
2. **If `denied`:** Show "Location Blocked" screen with browser-specific instructions (detect Chrome vs Safari via `navigator.userAgent`) to enable location in browser settings. No Start button — user must fix it in the browser first.
3. **If `prompt`:** Show the permission explanation card, then "Allow Location" button
4. **If `granted`:** Skip the card entirely, call `requestOnce()` to get initial coords, then proceed to start

**Permission explanation card design:**
- Icon: location pin
- Heading: "Location access needed"
- Body: "To start this task, we need to track your location so supervisors can monitor your route and confirm you reached the destination. Your location is only shared while this task is active."
- "Allow Location Access" button → calls `geolocation.requestOnce()` → triggers browser native prompt
- "Not Now" button → navigates back to task detail

---

### `components/tracking/ActiveTrackingBar.tsx` (new)

A fixed bottom bar (above the main nav) that appears site-wide on the agent layout whenever there is an active tracking session on this device.

- Shows: task title (truncated), "● Tracking" with pulsing red dot, elapsed time
- Tap → navigates to `app/agent/tasks/[id]/tracking`
- Controlled by an `activeTrackingTaskId` value stored in `store/tracking.ts` (agent-side field)

This ensures the agent can navigate away from the tracking page without stopping the tracker — `use-location-reporter` stays alive as long as `ActiveTrackingBar` is mounted in the layout tree.

---

### `components/tracking/CompleteTaskSheet.tsx` (new)

Bottom sheet for task completion:
- Camera/file upload for proof images (at least 1 required, validates before enabling submit)
- Image previews in a 3-column grid with remove button per image
- Notes text area (optional)
- Current GPS position shown as confirmation
- "Submit Completion" button with loading spinner
- Calls `completeTask(taskId, formData, token)`

---

## Phase 3 — Dashboard Map Integration

### Update `components/map/map-view.tsx`

**Step 1 — Remove demo data.**
Delete `INITIAL_AGENTS`, `ROUTE_COORDS`, `jitter()`, and the `setInterval` animation.

**Step 2 — Add WebSocket connection.**
Call `useTrackingWebSocket()` at the top of the component. This populates `useTrackingStore` automatically.

**Step 3 — Initial data hydration on map `load`:**
```typescript
// Fetch all in_progress tasks
const tasks = await listTasks({ company_id, status: 'in_progress' }, token)
// For each, fetch route for initial polyline
tasks.forEach(async (task) => {
  const route = await getTaskRoute(task.id, { company_id }, token)
  store.hydrateTasks([buildLiveTaskState(task, route)])
})
```

**Step 4 — Add GeoJSON sources and layers to the map once on load:**

| Source ID | Type | Content |
|---|---|---|
| `agent-positions` | GeoJSON FeatureCollection | Point per active agent (latest position) |
| `task-routes` | GeoJSON FeatureCollection | LineString per active task (polyline) |
| `task-destinations` | GeoJSON FeatureCollection | Point per task destination |

| Layer ID | Type | Source | Purpose |
|---|---|---|---|
| `agent-circles` | circle | `agent-positions` | Agent dot, color by status |
| `agent-labels` | symbol | `agent-positions` | Agent name text |
| `route-lines` | line | `task-routes` | Route trace (blue=active, green=arrived, gray=completed) |
| `destination-pins` | symbol | `task-destinations` | Purple destination marker |
| `arrival-zones` | circle | `task-destinations` | 75m radius circle at destination |

**Step 5 — React to store changes with `useEffect`:**
```typescript
useEffect(() => {
  if (!mapRef.current) return
  requestAnimationFrame(() => {
    map.getSource('agent-positions')?.setData(buildAgentsGeoJSON(liveTaskMap))
    map.getSource('task-routes')?.setData(buildRoutesGeoJSON(liveTaskMap))
    map.getSource('task-destinations')?.setData(buildDestinationsGeoJSON(liveTaskMap))
  })
}, [liveTaskMap])
```

**Step 6 — Keep the existing agent list sidebar.**
Drive `Object.values(liveTaskMap)` instead of `INITIAL_AGENTS`. Agent name, status, and zone come from task and tracking data.

**Step 7 — Agent click behavior.**
On click on `agent-circles` layer: `map.flyTo({ center: feature.geometry.coordinates, zoom: 15 })` and show the existing agent detail popup, now populated with real data (task name, last updated, distance to destination, arrival status).

---

## Phase 4 — Route History (Management Dashboard)

### `components/map/RouteHistoryPanel.tsx` (new)

Side drawer shown when a supervisor clicks a completed task.

- Calls `getTaskRoute(taskId, { company_id }, token)` using the admin endpoint
- Renders full route polyline on the map with checkpoint markers:
  - Green circle = start
  - Yellow circle = arrival
  - Red circle = completion
- Stats bar: total distance, duration, average speed (derived from summary)
- "Close" button removes the overlay and returns map to live view

---

## File Summary

| File | Action |
|---|---|
| `.env.local` | Add `NEXT_PUBLIC_WS_URL=wss://realtime.thefactory23.com` |
| `lib/api/tracking.ts` | Create — 5 API functions + types |
| `store/tracking.ts` | Create — Zustand store for live tracking state |
| `hooks/use-geolocation.ts` | Create — browser Geolocation API wrapper |
| `hooks/use-tracking-ws.ts` | Create — WebSocket client + reconnect + polling fallback |
| `hooks/use-location-reporter.ts` | Create — agent-side location batching (30s flush) |
| `app/agent/tasks/page.tsx` | Create — agent task list with Pending/In Progress/Completed tabs |
| `app/agent/tasks/[id]/page.tsx` | Create — task detail with mini-map |
| `app/agent/tasks/[id]/tracking/page.tsx` | Create — active tracking screen (3 phases) |
| `components/tracking/LocationPermissionGate.tsx` | Create — pre-prompt UI + denied fallback |
| `components/tracking/ActiveTrackingBar.tsx` | Create — persistent tracking indicator in agent layout |
| `components/tracking/CompleteTaskSheet.tsx` | Create — proof upload + notes + submit |
| `components/map/map-view.tsx` | Modify — replace demo data with live WebSocket + GeoJSON layers |
| `components/map/RouteHistoryPanel.tsx` | Create — historical route viewer for management |
| `app/agent/layout.tsx` | Modify — mount `ActiveTrackingBar` |

---

## Key Design Decisions

### Location permission — two-step flow
We show our own explanation card first (`LocationPermissionGate`), then trigger the browser prompt. This prevents the cold browser prompt that users reflexively deny because they don't know why the site needs location. Our card delivers the "why" before the browser asks.

### Location reporting — 30-second batch, not continuous POST
Posting every 5 seconds would be 12 requests/minute per agent. The backend accepts up to 50 points per batch, and persists points that are ≥15s or ≥20m apart anyway. Batching every 30 seconds sends 6 points per request — efficient and within the backend's design intent.

### GeoJSON sources over individual HTML markers
The current demo uses `new mapboxgl.Marker()` per agent. That works for 5 agents, but with many agents and frequent updates, DOM manipulation overhead becomes visible. GeoJSON + `setData()` is a single GPU-side update regardless of agent count.

### `ActiveTrackingBar` keeps the location reporter alive
If `use-location-reporter` was tied only to the tracking page, leaving the page would stop reporting. By mounting the reporter inside `ActiveTrackingBar` (which lives in the agent layout), tracking continues as long as the agent is anywhere in the app.

### Polling fallback is automatic
If WebSocket disconnects (`use-tracking-ws` detects via `onclose`), the hook switches to polling `getTaskRoute` every 25 seconds per active task. When the socket reconnects, polling stops. Supervisors see slightly delayed data but never a completely stale map.

### WebSocket auth via query string
Both query string and post-connect auth are supported by the relay. Query string auth (`?token=...&company_id=...`) avoids the 10-second auth timeout window and simplifies connection setup — the relay authenticates immediately on connect.
