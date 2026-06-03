# Factory23 Real-Time Tracking & Operations Command Center Audit

Date: 2026-06-01
Scope: Existing production codebase audit, updated after initial command center upgrades

## 1. Current Architecture

### Backend (Laravel 12)

- Core tracking orchestration is implemented in `App\Services\Task\TaskTrackingService`.
- REST endpoints for lifecycle actions are exposed via `TaskTrackingController`:
  - start tracking
  - record location
  - complete tracked task
  - fetch route history
- Agent location read model is maintained by `App\Services\Tracking\AgentLocationSnapshotService`.
- Tracking persistence models include:
  - `TaskTrackingSession`
  - `TaskLocationPoint`
  - `AgentLocationSnapshot`
- Company boundary enforcement is present in service-level checks and request-context resolution.

### Real-Time Layer (Node.js + Redis + WebSocket)

- Realtime relay exists in `backend/realtime-server/src/server.js`.
- Relay subscribes to Redis channel pattern:
  - `factory23.tracking.company.*` (prefix configurable)
- WebSocket auth is token-based (Sanctum introspection against Laravel `/api/v1/user/me`).
- Relay enforces company isolation and role-aware event visibility in `backend/realtime-server/src/filtering.js`.

### Frontend (Next.js + React + TypeScript)

- Real-time websocket client is already integrated in `hooks/use-tracking-ws.ts`.
- Live state aggregation is centralized in `store/tracking.ts`.
- Map surfaces:
  - `components/map/map-view.tsx` (management/global tracking map)
  - `components/map/agent-map-view.tsx` (agent-focused view)
  - `components/dashboard/dashboard-map.tsx` (dashboard widget)
- Runtime map provider switching exists via `use-effective-map-provider` and shared map loaders.

## 2. Tracking Data Flow

### Lifecycle flow

1. Agent starts tracking via `POST /api/v1/agent/tasks/{task}/start`.
2. Backend creates `task_tracking_sessions` record and initial `task_location_points` checkpoint.
3. Backend publishes Redis events (`tracking.task.started`, `tracking.location.updated`, `tracking.agent.location.updated`).
4. WebSocket relay receives Redis payload and pushes to authorized clients.
5. Agent sends location updates via `POST /api/v1/agent/tasks/{task}/location`.
6. Backend validates assignment + active session + task status, persists points per batching rules.
7. Geofence transitions emit `tracking.task.near_destination` then `tracking.task.arrived`.
8. Completion via `POST /api/v1/agent/tasks/{task}/complete` writes final checkpoint, proofs, task completion.
9. Backend publishes `tracking.task.completed`.
10. Frontend store updates and map views render movement trail, current markers, and route overlays.

## 3. Existing APIs (tracking-related)

### Task tracking APIs

- `POST /api/v1/agent/tasks/{task}/start`
- `POST /api/v1/agent/tasks/{task}/location`
- `POST /api/v1/agent/tasks/{task}/complete`
- `GET /api/v1/agent/tasks/{task}/route`
- `GET /api/v1/admin/tasks/{task}/route`

### Snapshot/read APIs

- `GET /api/v1/agent/agents/locations`
- `GET /api/v1/agent/agents/{user}/location`
- `GET /api/v1/admin/agents/locations`
- `GET /api/v1/admin/agents/{user}/location`

### Map provider API

- `GET /api/v1/map/provider`

## 4. Existing WebSocket Events

Published by backend and relayed to frontend:

- `tracking.task.started`
- `tracking.location.updated`
- `tracking.agent.location.updated`
- `tracking.task.near_destination`
- `tracking.task.arrived`
- `tracking.task.completed`

System-level relay messages include:

- `system.connected`
- `system.auth_required`
- `system.error`
- `system.subscribed_task`
- `system.unsubscribed_task`
- `pong`

## 5. Existing Redis Usage

### Channels

- Company stream: `<prefix>.company.{company_id}`
- Task stream: `<prefix>.task.{task_id}`
- Default prefix: `factory23.tracking` (configurable)

### Behavior

- Backend publishes tracking lifecycle payloads to both company and task channels.
- Relay pattern-subscribes company channels and forwards only authorized events.

## 6. Existing Tracking Logic

Implemented in `TaskTrackingService`:

- Assignment guard (`ensureAssignedUser`) before tracking actions.
- Session guard (single active session per task).
- Batch ingestion with max points limit.
- Point persistence throttle by min interval + min distance.
- Real-time payload enrichment with task, agent, destination, status, location snapshots.
- Realtime payload enrichment now includes project metadata, ETA, route deviation, and operational status.
- Completion guard requiring arrival detection before completion.

## 7. Existing Geofence Logic

Implemented and currently robust against false positives:

- Destination radius from session/config (`arrival_radius_meters`, default currently 100).
- Near radius (`near_radius_meters`, default 250).
- Accuracy confidence gates:
  - near max accuracy threshold
  - arrival max accuracy threshold
- Minimum movement before proximity transitions.
- Dwell-time requirement between near and arrival.
- No arrival/completion when proximity confidence conditions are not met.

## 8. Existing ETA Logic

Current state:

- Backend and snapshots include distance-to-destination and distance-remaining fields.
- Speed is captured from telemetry (`speed_mps`) when provided.
- Backend tracking payloads and snapshot read models now expose ETA (`eta_seconds`) and route deviation (`route_deviation_meters`).
- Backend tracking payloads and snapshots now expose operational state (`operational_status`) for command-center visuals.
- Frontend already uses Mapbox Directions route geometry for visual forward-route overlays.

## 9. Existing Map Features

### Implemented

- Mapbox + Google maps are both supported with runtime fallback.
- Mapbox management view now uses navigation day/night styles via shared appearance resolution.
- Privacy-safe default viewport (regional/country/global fallback), no Lagos hardcode at map default layer.
- Smooth marker interpolation (Mapbox and agent map).
- Movement trail rendering from persisted polyline points.
- Destination and origin markers with state-aware visuals.
- Forward route overlay from Mapbox Directions API.
- Sidebar feed with task, agent, project, address, and task-id filtering plus focus behavior.
- Place geocoding search is available on the Mapbox command-center surface.
- Command-center feed rows and the selected-agent panel expose ETA, speed, distance remaining, route deviation, and operational status badges.
- Main Mapbox renderer now applies viewport-bounded task rendering to avoid drawing every agent at once.
- Dashboard map widget integration.

### Remaining gaps after initial upgrade pass

- Google fallback view still trails the Mapbox command-center path in selected-agent panel depth and place-search parity.
- No map-source clustering yet; current scale mitigation is viewport-bounded rendering rather than full clustering/aggregation.
- Search is stronger on live tracking data and places, but it is not yet expanded into a richer cross-entity operations index.

## 10. Security & Multi-Tenant Findings

- Backend validates company context on tracking operations.
- Relay filters by company and role before delivery.
- Agent role visibility is restricted to own events plus explicitly subscribed task IDs.
- Architecture is compatible with org-level data isolation requirements.

## 11. Remaining Upgrade Targets for Command Center Phase

1. Bring the Google fallback view closer to the Mapbox command-center feature set.
2. Add true map-source clustering/aggregation for 100+ concurrent agents.
3. Expand search into a richer cross-entity operations index beyond live task fields and geocoded places.
4. Continue refining command panel detail density and enterprise workflow actions.
5. Keep backward compatibility for existing events and route APIs.
