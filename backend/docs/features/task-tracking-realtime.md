# Task Tracking Realtime API

## Overview

This feature delivers production-ready, task-driven live agent tracking with:

1. Laravel tracking APIs for lifecycle state changes and trace storage.
2. Redis event fanout for low-latency pub/sub.
3. Node.js WebSocket relay for frontend subscriptions.
4. Daily retention pruning for storage lifecycle management.

## Architecture

### Backend write path

1. Agent starts tracking on assigned task.
2. API creates a tracking session and first checkpoint.
3. Location updates are ingested as single points or batches.
4. Persistence is throttled by configured time and distance thresholds.
5. Arrival is detected automatically inside configured destination radius.
6. Completion requires proof files and final coordinates.

### Realtime fanout path

1. Laravel publishes events to Redis channels:
   - `factory23.tracking.company.{company_id}`
   - `factory23.tracking.task.{task_id}`
2. Node relay subscribes to `factory23.tracking.company.*`.
3. Relay authenticates client sockets against `GET /api/v1/user/me`.
4. Relay pushes events to company-matching sockets with role-aware filtering.

### Storage lifecycle

1. `tracking:prune` runs daily at `02:00`.
2. Closed sessions older than retention are deleted.
3. Old non-checkpoint points are pruned for remaining sessions.
4. Checkpoints are retained to preserve journey milestones.

## Data Model

### task_tracking_sessions

1. One row per tracked task.
2. Contains start, last known, arrival, destination, and completion checkpoints.
3. Company-scoped with strict tenant constraints.

### task_location_points

1. Chronological coordinates linked to tracking session and task.
2. Supports event types (`start`, `movement`, `arrival`, `complete`).
3. Includes checkpoint flag for important milestones.

### agent_location_snapshots

1. Materialized latest-location row per `(company_id, user_id)`.
2. Updated from tracking lifecycle writes (`start`, `location`, `complete`).
3. Includes last event type, task reference, arrival flag, and staleness metadata inputs.

## Endpoints

All endpoints require `Authorization: Bearer <token>` and `Accept: application/json`.

1. `POST /api/v1/tasks/{task}/start`
2. `POST /api/v1/tasks/{task}/location`
3. `POST /api/v1/tasks/{task}/complete`
4. `GET /api/v1/tasks/{task}/route`
5. `GET /api/v1/agents/locations`
6. `GET /api/v1/agents/{user}/location`

Canonical role-scoped equivalents are available under:

1. `/api/v1/agent/tasks/*` for agent actions
2. `/api/v1/admin/tasks/*` for management route access
3. `/api/v1/agent/agents/*` and `/api/v1/admin/agents/*` for map snapshot reads

## Map Read Model (Dual Contract)

1. Task execution lifecycle remains canonical through `/tasks/{task}/start|location|complete|route`.
2. Map/dashboard snapshot reads should use `/agents/locations` or `/agents/{user}/location`.
3. Snapshot status is derived from `last_seen_at` against `TASK_TRACKING_AGENT_LOCATION_STALE_AFTER_SECONDS`.
4. Agents can fetch only their own snapshot; management users can fetch company-wide snapshots.

## Request Contracts

### Start tracking

`POST /api/v1/tasks/{task}/start`

```json
{
  "company_id": 1,
  "location_permission_granted": true,
  "latitude": 6.4,
  "longitude": 3.39,
  "accuracy_meters": 5,
  "recorded_at": "2026-04-29T14:00:00Z"
}
```

### Send location (single point)

`POST /api/v1/tasks/{task}/location`

```json
{
  "company_id": 1,
  "latitude": 6.401,
  "longitude": 3.391,
  "speed_mps": 4.2,
  "heading_degrees": 180,
  "recorded_at": "2026-04-29T14:03:00Z"
}
```

### Send location (batch)

```json
{
  "company_id": 1,
  "points": [
    {
      "latitude": 6.41,
      "longitude": 3.4,
      "recorded_at": "2026-04-29T14:05:00Z"
    },
    {
      "latitude": 6.4301,
      "longitude": 3.4201,
      "recorded_at": "2026-04-29T14:07:00Z"
    }
  ]
}
```

### Complete tracked task

`POST /api/v1/tasks/{task}/complete` as `multipart/form-data`:

1. `company_id`
2. `latitude`
3. `longitude`
4. `accuracy_meters` optional
5. `notes` optional
6. `files[]` required image proofs (at least one)

### Get route

`GET /api/v1/tasks/{task}/route?company_id=1&include_points=true&limit=500`

Returns start/arrival/end checkpoints, point timeline, and Mapbox-ready polyline coordinates.

## Realtime Event Contract

### Event envelope

```json
{
  "event": "tracking.location.updated",
  "version": 1,
  "company_id": 1,
  "task_id": 123,
  "tracking_session_id": 9,
  "user_id": 77,
  "occurred_at": "2026-04-29T14:05:00Z",
  "data": {
    "latitude": 6.4301,
    "longitude": 3.4201,
    "accuracy_meters": 5,
    "arrived": false,
    "event_type": "movement"
  }
}
```

`tracking.agent.location.updated` reuses the same envelope and extends `data` with:

1. `agent` summary (`id`, `name`, `internal_role`)
2. `location` object (lat/lng/accuracy/speed/heading/event/recorded_at)
3. `status` object (`is_online`, `is_stale`, `last_seen_at`, `stale_after_seconds`, `age_seconds`)

### Event types

1. `tracking.task.started`
2. `tracking.location.updated`
3. `tracking.task.arrived`
4. `tracking.task.completed`
5. `tracking.agent.location.updated`

## WebSocket + Polling Strategy

1. Subscribe websocket clients to `factory23.tracking.company.{company_id}` for low-latency updates.
2. Apply role-aware filtering in relay (`management` sees all company events; `agent` sees self/subscribed tasks).
3. On websocket reconnect or missed-heartbeat scenarios, refresh state via:

- `GET /api/v1/agents/locations` for map marker snapshots.
- `GET /api/v1/tasks/{task}/route` for route reconstruction.

4. Recommended fallback polling cadence: 10-15 seconds until websocket state recovers.

## Validation and Rules

1. Agent must be current task assignee.
2. Task must belong to active company context.
3. Start requires `location_permission_granted=true`.
4. Location updates require task status `in_progress` and active tracking session.
5. Completion requires proof files and task status `in_progress`.
6. Management users can fetch route; agents can fetch only their assigned tasks.

## Configuration

Laravel env keys:

1. `TASK_TRACKING_ARRIVAL_RADIUS_METERS`
2. `TASK_TRACKING_PERSIST_MIN_INTERVAL_SECONDS`
3. `TASK_TRACKING_PERSIST_MIN_DISTANCE_METERS`
4. `TASK_TRACKING_MAX_BATCH_POINTS`
5. `TASK_TRACKING_REDIS_CHANNEL_PREFIX`
6. `TASK_TRACKING_RETENTION_DAYS`
7. `TASK_TRACKING_PRUNE_CHUNK_SIZE`
8. `TASK_TRACKING_AGENT_LOCATION_STALE_AFTER_SECONDS`

Node relay env keys:

1. `TRACKING_WS_PORT`
2. `TRACKING_WS_REDIS_HOST` / `TRACKING_WS_REDIS_URL`
3. `TRACKING_WS_AUTH_API_BASE_URL`
4. `TRACKING_WS_AUTH_ME_PATH`
5. `TRACKING_WS_HEARTBEAT_MS`
6. `TRACKING_WS_AUTH_TIMEOUT_MS`

## Status Codes

1. `200`: successful start/location/complete/route fetch.
2. `401`: unauthenticated token.
3. `422`: validation, assignment, state-transition, or tenant context failure.
