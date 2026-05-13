# Factory23 Realtime Tracking Relay

This service relays Laravel tracking events from Redis to WebSocket clients.

## Features

- Redis pattern subscription on `factory23.tracking.company.*`
- Sanctum token introspection against Laravel `GET /api/v1/user/me`
- Company-level tenant isolation
- Role-aware event visibility:
  - management roles: all events in active company
  - agents: own events plus explicitly subscribed tasks
- Connection heartbeat and stale socket eviction

## Client Protocol

1. Connect:

```text
ws://localhost:8081?token=<SANCTUM_TOKEN>&company_id=<COMPANY_ID>&task_ids=123,124
```

2. Or connect without query token and authenticate after socket open:

```json
{
  "type": "authenticate",
  "token": "...",
  "company_id": 21,
  "task_ids": [123, 124]
}
```

3. Optional controls:

```json
{ "type": "subscribe_task", "task_id": 123 }
{ "type": "unsubscribe_task", "task_id": 123 }
{ "type": "ping" }
```

4. Tracking events are pushed directly with the event name as `type`:

```json
{
  "type": "tracking.location.updated",
  "channel": "factory23.tracking.company.21",
  "payload": {
    "event": "tracking.location.updated",
    "version": 1,
    "company_id": 21,
    "task_id": 123,
    "tracking_session_id": 9,
    "user_id": 77,
    "occurred_at": "2026-04-29T14:05:00Z",
    "data": {
      "latitude": 6.4301,
      "longitude": 3.4201,
      "arrived": false,
      "event_type": "movement"
    }
  }
}
```

## Environment Variables

- `TRACKING_WS_HOST` default `0.0.0.0`
- `TRACKING_WS_PORT` default `8081`
- `TRACKING_WS_REDIS_URL` optional full Redis URL
- `TRACKING_WS_REDIS_HOST` default `redis`
- `TRACKING_WS_REDIS_PORT` default `6379`
- `TRACKING_WS_REDIS_PASSWORD` optional
- `TRACKING_WS_REDIS_DB` default `0`
- `TRACKING_WS_AUTH_API_BASE_URL` default `http://nginx`
- `TRACKING_WS_AUTH_ME_PATH` default `/api/v1/user/me`
- `TASK_TRACKING_REDIS_CHANNEL_PREFIX` default `factory23.tracking`
- `TRACKING_WS_HEARTBEAT_MS` default `30000`
- `TRACKING_WS_AUTH_TIMEOUT_MS` default `10000`
- `TRACKING_WS_MAX_MESSAGE_BYTES` default `32768`
- `TRACKING_WS_LOG_LEVEL` default `info`

## Local Run

```bash
cd realtime-server
npm install
npm run start
```

## Tests

```bash
cd realtime-server
npm test
```
