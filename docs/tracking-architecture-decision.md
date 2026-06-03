# Tracking Architecture Decision

## Status

Accepted on 2026-05-16 for all ongoing map and live-tracking implementation work.

## Decision

The canonical real-time tracking architecture for this platform is:

```text
Laravel tracking APIs
  -> Redis pub/sub
  -> Node.js WebSocket relay
  -> Next.js clients
```

Implementation work must follow the code paths already present in:

1. `backend/src/app/Services/Task/TaskTrackingService.php`
2. `backend/realtime-server/src/server.js`
3. `backend/src/app/Services/Tracking/AgentLocationSnapshotService.php`

## Canonical Contract

### Execution lifecycle

Task execution and tracking writes remain canonical through:

1. `POST /api/v1/agent/tasks/{task}/start`
2. `POST /api/v1/agent/tasks/{task}/location`
3. `POST /api/v1/agent/tasks/{task}/complete`
4. `GET /api/v1/agent/tasks/{task}/route`
5. `GET /api/v1/admin/tasks/{task}/route`

### Map read model

Map and dashboard visibility must bootstrap from:

1. `GET /api/v1/agents/locations`
2. `GET /api/v1/agents/{user}/location`

The snapshot read model is company-scoped and backed by `agent_location_snapshots`.

### Realtime transport

Laravel publishes tracking envelopes to Redis channels:

1. `factory23.tracking.company.{company_id}`
2. `factory23.tracking.task.{task_id}`

The Node relay subscribes to company channels, authenticates against Laravel `GET /api/v1/user/me`, then filters delivery by company and access role before pushing events to Next.js clients over WebSocket.

## Canonical Reference Docs

Use these documents when implementing or reviewing tracking work:

1. `backend/docs/features/task-tracking-realtime.md`
2. `TRACKING_IMPLEMENTATION_PLAN.md`
3. This decision note

`TRACKING_IMPLEMENTATION_PLAN.md` is a secondary planning guide and must yield to current code if any example drifts from implementation.

## Obsolete Docs For Implementation Decisions

Do not use these documents to drive new implementation work:

1. `docs/map-realtime-tracking-plan.md`
2. `api docs/features/map-live-tracking.md`

They describe different realtime stacks, including Socket.IO, Laravel Reverb, Laravel Echo, or MapLibre/MapTiler-driven plans that do not match the current production-directed codebase.

## Required Constraints

1. Do not introduce Socket.IO, Laravel Reverb, or Laravel Echo for this feature.
2. Do not replace the Node relay transport without an explicit architecture decision.
3. Keep Laravel as the source of truth for task state, tracking session state, arrival detection, proofs, and route history.
4. Treat WebSocket events as incremental delivery, not as the persistence layer.
5. Bootstrap map state from REST snapshots and then merge WebSocket deltas.

## Frontend Implications

1. Next.js must connect to the relay via an environment-driven WebSocket URL.
2. Management map views must load snapshot state before waiting for fresh events.
3. Agent views must only expose the authenticated agent's own active tracking state unless an explicitly allowed management context applies.
4. Mapbox token usage must remain environment-based and restricted; no hardcoded tokens.

## Follow-On Work

Subsequent implementation phases must build on this decision in the following order:

1. Token and environment strategy
2. Frontend snapshot bootstrap and realtime contract stabilization
3. Management dashboard integration
4. Agent dashboard tracking continuity
5. Realtime hardening and production rollout
