# Task Tracking Realtime Frontend Guide

## Goal

Render live agent movement for active tasks and support start, location sync, arrival, and completion from frontend clients.

## API + WebSocket Flow

1. Agent app calls `POST /api/v1/tasks/{task}/start` when task execution begins.
2. Agent app sends periodic or batched location updates to `POST /api/v1/tasks/{task}/location`.
3. Backend emits Redis events, relay forwards to subscribed sockets.
4. Dashboard listens over WebSocket and updates map in real time.
5. Agent app completes task with proofs via `POST /api/v1/tasks/{task}/complete`.
6. Dashboard fetches historical route with `GET /api/v1/tasks/{task}/route`.

## WebSocket Connection

Relay default URL:

1. `ws://<host>:8081`

Connect with token and active company:

```ts
const ws = new WebSocket(
  `wss://realtime.thefactory23.com?token=${token}&company_id=${activeCompanyId}`,
);
```

Alternative post-connect auth:

```json
{ "type": "authenticate", "token": "<token>", "company_id": 21 }
```

Optional task controls:

```json
{ "type": "subscribe_task", "task_id": 123 }
{ "type": "unsubscribe_task", "task_id": 123 }
```

## Event Handling

Expected `type` values:

1. `tracking.task.started`
2. `tracking.location.updated`
3. `tracking.task.arrived`
4. `tracking.task.completed`

Each event payload includes company/task/session IDs and coordinate data.

Recommended frontend reducer keys:

1. `task_id`
2. `tracking_session_id`
3. `occurred_at`
4. `data.latitude`
5. `data.longitude`
6. `data.event_type`
7. `data.arrived`

## Next.js + Mapbox Integration Pattern

### Suggested state model

1. Maintain `liveTaskMap: Record<taskId, LiveTaskState>` in a store (Zustand/Redux/React context).
2. Track polyline source as ordered coordinates `[lng, lat]`.
3. Keep marker per active task for latest position.
4. Mark arrival and completion checkpoints with distinct symbols.

### Minimal client-side handler

```ts
type TrackingEnvelope = {
  type: string;
  payload: {
    task_id: number;
    data?: {
      latitude?: number;
      longitude?: number;
      event_type?: string;
      arrived?: boolean;
    };
  };
};

ws.onmessage = (evt) => {
  const msg = JSON.parse(evt.data) as TrackingEnvelope;
  if (!msg.payload?.task_id) return;

  const lat = msg.payload?.data?.latitude;
  const lng = msg.payload?.data?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return;

  updateLiveTask(msg.payload.task_id, {
    lastPosition: [lng, lat],
    eventType: msg.payload.data?.event_type,
    arrived: !!msg.payload.data?.arrived,
  });
};
```

### Mapbox rendering notes

1. Use one GeoJSON source for polylines and one for markers.
2. Batch UI updates with `requestAnimationFrame` if event volume is high.
3. Use route API for initial hydration when dashboard opens.
4. Merge websocket deltas after initial route load.

## Polling Fallback

If socket disconnects for more than a threshold window:

1. Keep retrying websocket with exponential backoff.
2. Poll `GET /api/v1/tasks/{task}/route` every 20-30 seconds for active tasks.
3. Stop polling when task is terminal (`completed` or `cancelled`).

## Validation UX

1. Require explicit location consent before calling `start`.
2. Show optimistic movement state, but reconcile with server response.
3. On `422` errors, surface actionable message from `errors` payload.
4. On `401`, refresh token/session and reconnect socket.

## Security Notes

1. Treat WebSocket and API tokens as sensitive credentials.
2. Prefer secure `wss` in production.
3. Do not persist raw websocket messages containing auth context in browser logs.
4. Respect role visibility: agents should only render tasks they can access.
