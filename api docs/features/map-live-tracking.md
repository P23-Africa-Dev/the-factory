# Map — Live Agent Location Tracking

## Status

This file is a historical deep-dive reference.
Canonical production contract documentation is maintained in:

1. `features/task-tracking-realtime.md`
2. `frontend-guide/task-tracking-realtime.md`
3. `../backend/openapi/openapi.yaml`

**Backend Integration Specification**

> **Stack:** Laravel (REST API) · Laravel Reverb (WebSocket) · Laravel Echo (frontend bridge)  
> **Frontend:** Next.js · Mapbox GL JS  
> **Last updated:** 2026-05-13

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Data Models](#data-models)
4. [REST API Endpoints](#rest-api-endpoints)
5. [Real-time Layer (Laravel Reverb + Echo)](#real-time-layer)
6. [Frontend Integration Contract](#frontend-integration-contract)
7. [API Response Shapes (full examples)](#api-response-shapes)
8. [Error Handling](#error-handling)
9. [Common Pain Points & Debugging](#common-pain-points--debugging)
10. [Security Considerations](#security-considerations)

---

## Overview

The map feature displays the **live location of field agents** on a Mapbox map. Two complementary layers drive it:

| Layer            | Transport                    | Purpose                                 |
| ---------------- | ---------------------------- | --------------------------------------- |
| **Initial load** | REST `GET /agents/locations` | Fetch all agent positions on page mount |
| **Live updates** | WebSocket (Reverb channel)   | Stream position deltas as agents move   |

The frontend merges both: REST gives the initial snapshot, WebSocket updates individual markers in place. The mobile app (on the agent's device) is responsible for periodically **pushing** its GPS coordinates to the backend.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Agent Mobile App                                               │
│  (React Native / Flutter)                                       │
│  • GPS listener fires every N seconds                           │
│  • POST /api/v1/agents/location  ──────────────────────────────►│
└─────────────────────────────────────────────────────────────────┘
                                         │
                            ┌────────────▼─────────────┐
                            │  Laravel API              │
                            │  UpdateAgentLocationJob   │
                            │  (validates, persists,    │
                            │   broadcasts event)       │
                            └────────────┬─────────────┘
                                         │ broadcasts
                              ┌──────────▼──────────┐
                              │  Laravel Reverb      │
                              │  WebSocket server    │
                              └──────────┬──────────┘
                                         │ pushes
                            ┌────────────▼─────────────┐
                            │  Next.js Dashboard        │
                            │  Laravel Echo client      │
                            │  → updates Mapbox markers │
                            └──────────────────────────┘
```

---

## Data Models

### `agent_locations` table

```sql
CREATE TABLE agent_locations (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       BIGINT UNSIGNED NOT NULL,          -- FK → users.id
    company_id    BIGINT UNSIGNED NOT NULL,
    latitude      DECIMAL(10, 7) NOT NULL,
    longitude     DECIMAL(10, 7) NOT NULL,
    accuracy      FLOAT UNSIGNED NULL,               -- metres, from GPS
    heading       SMALLINT UNSIGNED NULL,            -- 0–359 degrees
    speed         FLOAT UNSIGNED NULL,               -- m/s
    altitude      FLOAT NULL,
    recorded_at   TIMESTAMP NOT NULL,                -- device timestamp
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_recorded (user_id, recorded_at DESC),
    INDEX idx_company (company_id)
);
```

> **Why `recorded_at` separate from `created_at`?**  
> Mobile devices may buffer updates when offline and flush them in batch later. `recorded_at` is the true GPS timestamp; `created_at` is when the row was written.

### `agent_location_snapshots` table (denormalised, fast-read)

The REST snapshot endpoint (`GET /agents/locations`) should not run a `MAX(recorded_at)` group-by across potentially millions of rows on every page load. Maintain a separate `agent_location_snapshots` table — one row per agent, upserted on every location push.

```sql
CREATE TABLE agent_location_snapshots (
    user_id       BIGINT UNSIGNED PRIMARY KEY,
    company_id    BIGINT UNSIGNED NOT NULL,
    latitude      DECIMAL(10, 7) NOT NULL,
    longitude     DECIMAL(10, 7) NOT NULL,
    heading       SMALLINT UNSIGNED NULL,
    speed         FLOAT UNSIGNED NULL,
    accuracy      FLOAT UNSIGNED NULL,
    is_online     BOOLEAN NOT NULL DEFAULT FALSE,
    last_seen_at  TIMESTAMP NOT NULL,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_company (company_id)
);
```

`is_online` is `TRUE` while `last_seen_at` is within the last 5 minutes (set by a scheduled job or derived on read).

---

## REST API Endpoints

All endpoints follow the existing envelope:

```jsonc
{
  "success": true,
  "message": "...",
  "data": { ... },
  "errors": null
}
```

---

### `GET /api/v1/agents/locations`

Returns the latest known position for every agent that belongs to the authenticated user's company. Called **once on map mount**.

#### Query Parameters

| Param        | Type                   | Default    | Description                             |
| ------------ | ---------------------- | ---------- | --------------------------------------- |
| `company_id` | integer                | from token | Scope to a specific company (admin use) |
| `zone`       | string                 | —          | Filter by assigned zone label           |
| `status`     | `online\|offline\|all` | `all`      | Filter by online status                 |

#### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Agent locations retrieved.",
  "data": {
    "agents": [
      {
        "id": 42,
        "name": "Lade Wane",
        "email": "lade.wane@thefactory.com",
        "role": "agent",
        "avatar_url": "https://cdn.thefactory23.com/avatars/lade-wane.jpg",
        "zone": "Ikeja LGA",
        "address": "28, Akinlusi way, Ikeja",
        "phone": "+234 803 4567890",
        "is_online": true,
        "last_seen_at": "2026-05-13T10:42:17Z",
        "location": {
          "latitude": 6.6018,
          "longitude": 3.3515,
          "heading": 92,
          "speed": 14.5,
          "accuracy": 8.3,
          "recorded_at": "2026-05-13T10:42:15Z"
        },
        "current_task": {
          "id": 201,
          "title": "Visit Ikeja Computer Village",
          "status": "in_progress"
        }
      },
      {
        "id": 43,
        "name": "Francis Nasyomba",
        "email": "francis@thefactory.com",
        "role": "agent",
        "avatar_url": "https://cdn.thefactory23.com/avatars/francis.jpg",
        "zone": "Agege LGA",
        "address": "12, Lagos Road, Agege",
        "phone": "+234 803 4567891",
        "is_online": false,
        "last_seen_at": "2026-05-12T22:10:00Z",
        "location": {
          "latitude": 6.5841,
          "longitude": 3.3705,
          "heading": null,
          "speed": null,
          "accuracy": null,
          "recorded_at": "2026-05-12T22:09:58Z"
        },
        "current_task": null
      }
    ],
    "meta": {
      "total": 2,
      "online_count": 1,
      "offline_count": 1
    }
  },
  "errors": null
}
```

> **Note on `location`:** if an agent has never reported their location, `location` is `null` — the frontend should skip placing a marker for that agent.

---

### `POST /api/v1/agents/location` _(Mobile App → Backend)_

Called by the agent's mobile app every N seconds (recommended: every 10–30 seconds while active, every 5 minutes when idle/backgrounded).

#### Request Body

```json
{
  "latitude": 6.6018,
  "longitude": 3.3515,
  "heading": 92,
  "speed": 14.5,
  "accuracy": 8.3,
  "altitude": 22.1,
  "recorded_at": "2026-05-13T10:42:15Z"
}
```

| Field         | Type     | Required | Constraints               |
| ------------- | -------- | -------- | ------------------------- |
| `latitude`    | decimal  | yes      | -90 to 90                 |
| `longitude`   | decimal  | yes      | -180 to 180               |
| `heading`     | integer  | no       | 0–359                     |
| `speed`       | float    | no       | ≥ 0, m/s                  |
| `accuracy`    | float    | no       | ≥ 0, metres               |
| `altitude`    | float    | no       | metres                    |
| `recorded_at` | ISO 8601 | yes      | Must not be in the future |

#### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Location updated.",
  "data": {
    "user_id": 42,
    "recorded_at": "2026-05-13T10:42:15Z"
  },
  "errors": null
}
```

#### Laravel Controller (reference)

```php
// app/Http/Controllers/Api/AgentLocationController.php

public function update(UpdateLocationRequest $request): JsonResponse
{
    $user = $request->user();

    DB::transaction(function () use ($user, $request) {
        // 1. Persist history row
        AgentLocation::create([
            'user_id'     => $user->id,
            'company_id'  => $user->company_id,
            'latitude'    => $request->latitude,
            'longitude'   => $request->longitude,
            'heading'     => $request->heading,
            'speed'       => $request->speed,
            'accuracy'    => $request->accuracy,
            'altitude'    => $request->altitude,
            'recorded_at' => $request->recorded_at,
        ]);

        // 2. Upsert snapshot for fast reads
        AgentLocationSnapshot::updateOrCreate(
            ['user_id' => $user->id],
            [
                'company_id'   => $user->company_id,
                'latitude'     => $request->latitude,
                'longitude'    => $request->longitude,
                'heading'      => $request->heading,
                'speed'        => $request->speed,
                'accuracy'     => $request->accuracy,
                'is_online'    => true,
                'last_seen_at' => $request->recorded_at,
            ]
        );
    });

    // 3. Broadcast to the company's private channel
    broadcast(new AgentLocationUpdated($user, $request->validated()))
        ->toOthers();

    return $this->success('Location updated.', ['user_id' => $user->id, 'recorded_at' => $request->recorded_at]);
}
```

---

### `GET /api/v1/agents/{id}/location/history`

Returns a time-series of locations for route playback / audit trail.

#### Query Parameters

| Param   | Type     | Default     | Description            |
| ------- | -------- | ----------- | ---------------------- |
| `from`  | ISO 8601 | today 00:00 | Start of time range    |
| `to`    | ISO 8601 | now         | End of time range      |
| `limit` | integer  | 500         | Max rows (cap at 2000) |

#### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Location history retrieved.",
  "data": {
    "agent_id": 42,
    "agent_name": "Lade Wane",
    "from": "2026-05-13T00:00:00Z",
    "to": "2026-05-13T10:42:17Z",
    "points": [
      {
        "latitude": 6.59,
        "longitude": 3.34,
        "heading": 45,
        "speed": 0,
        "recorded_at": "2026-05-13T08:00:10Z"
      },
      {
        "latitude": 6.591,
        "longitude": 3.3415,
        "heading": 47,
        "speed": 8.2,
        "recorded_at": "2026-05-13T08:00:40Z"
      },
      {
        "latitude": 6.595,
        "longitude": 3.347,
        "heading": 92,
        "speed": 14.5,
        "recorded_at": "2026-05-13T08:01:15Z"
      }
    ],
    "total_points": 3
  },
  "errors": null
}
```

The `points` array is ordered by `recorded_at ASC`. Feed it directly to Mapbox as a `LineString` `GeoJSON` geometry for route replay.

---

## Real-time Layer

### Laravel Reverb Setup

```php
// config/reverb.php  (generated by: php artisan reverb:install)
// Runs on ws://your-server:8080 (configurable)
```

### Broadcast Event

```php
// app/Events/AgentLocationUpdated.php

class AgentLocationUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public readonly User $agent,
        public readonly array $location
    ) {}

    // Broadcast on a private channel scoped to the company.
    // The dashboard subscribes to this channel for all agents.
    public function broadcastOn(): array
    {
        return [
            new PrivateChannel("company.{$this->agent->company_id}.locations"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'agent.location.updated';
    }

    // Shape of the payload sent over the wire
    public function broadcastWith(): array
    {
        return [
            'agent_id'    => $this->agent->id,
            'name'        => $this->agent->name,
            'avatar_url'  => $this->agent->avatar_url,
            'zone'        => $this->agent->zone,
            'is_online'   => true,
            'last_seen_at'=> now()->toIso8601String(),
            'location' => [
                'latitude'    => $this->location['latitude'],
                'longitude'   => $this->location['longitude'],
                'heading'     => $this->location['heading'] ?? null,
                'speed'       => $this->location['speed'] ?? null,
                'accuracy'    => $this->location['accuracy'] ?? null,
                'recorded_at' => $this->location['recorded_at'],
            ],
        ];
    }
}
```

### Channel Authorization

```php
// routes/channels.php

Broadcast::channel('company.{companyId}.locations', function (User $user, int $companyId) {
    // Only supervisors/admins of this company may subscribe
    return (int) $user->company_id === $companyId
        && in_array($user->role, ['admin', 'supervisor']);
});
```

---

## Frontend Integration Contract

### WebSocket Payload (what the frontend receives on every agent move)

```jsonc
// Event: "tracking.agent.location.updated"
// Channel: "factory23.tracking.company.{companyId}" (via relay)
{
  "event": "tracking.agent.location.updated",
  "version": 1,
  "company_id": 12,
  "task_id": 248,
  "tracking_session_id": 90,
  "user_id": 42,
  "occurred_at": "2026-05-13T10:42:17Z",
  "data": {
    "task_status": "in_progress",
    "arrived": false,
    "event_type": "movement",
    "agent": {
      "id": 42,
      "name": "Lade Wane",
      "internal_role": "agent",
    },
    "location": {
      "latitude": 6.6022,
      "longitude": 3.3518,
      "heading_degrees": 94,
      "speed_mps": 13.9,
      "accuracy_meters": 7.1,
      "recorded_at": "2026-05-13T10:42:15Z",
    },
    "status": {
      "is_online": true,
      "is_stale": false,
      "last_seen_at": "2026-05-13T10:42:17Z",
      "stale_after_seconds": 300,
      "age_seconds": 0,
    },
  },
}
```

### How `map-view.tsx` should consume this

Replace the current `setInterval` jitter simulation with:

```typescript
// Pseudocode — illustrates the intended data flow

// 1. On mount: REST snapshot → place all markers
const { data } = await fetch("/api/v1/agents/locations?company_id=...");
setAgents(data.items);

// 2. Subscribe to Reverb channel via Laravel Echo
relaySocket.onmessage = ({ data: raw }) => {
  const payload = JSON.parse(raw);
  if (payload.event !== "tracking.agent.location.updated") return;

  const event = payload.data;

  setAgents((prev) =>
    prev.map((a) =>
      a.agent.id === Number(event.agent.id)
        ? {
            ...a,
            location: {
              ...a.location,
              latitude: event.location.latitude,
              longitude: event.location.longitude,
              heading_degrees: event.location.heading_degrees,
              speed_mps: event.location.speed_mps,
              accuracy_meters: event.location.accuracy_meters,
              recorded_at: event.location.recorded_at,
            },
            status: event.status,
          }
        : a,
    ),
  );
  // Move the Mapbox marker directly (no re-render needed)
  markersRef.current
    .get(String(event.agent.id))
    ?.setLngLat([event.location.longitude, event.location.latitude]);
};

// 3. Fallback polling (if websocket disconnected)
setInterval(async () => {
  if (relaySocket.readyState === WebSocket.OPEN) return;
  const { data } = await fetch("/api/v1/agents/locations?company_id=...");
  setAgents(data.items);
}, 15000);
```

### TypeScript types the frontend should declare

```typescript
// lib/api/map.ts  (to be created)

export interface AgentLocation {
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null; // m/s
  accuracy: number | null; // metres
  recorded_at: string; // ISO 8601
}

export interface AgentCurrentTask {
  id: number;
  title: string;
  status: "pending" | "in_progress" | "completed";
}

export interface MapAgent {
  id: number;
  name: string;
  email: string;
  role: "agent" | "supervisor";
  avatar_url: string;
  zone: string;
  address: string;
  phone: string;
  is_online: boolean;
  last_seen_at: string; // ISO 8601
  location: AgentLocation | null;
  current_task: AgentCurrentTask | null;
}

export interface AgentLocationsResponse {
  agents: MapAgent[];
  meta: {
    total: number;
    online_count: number;
    offline_count: number;
  };
}

// WebSocket event payload
export interface AgentLocationUpdatedEvent {
  agent_id: number;
  name: string;
  avatar_url: string;
  zone: string;
  is_online: boolean;
  last_seen_at: string;
  location: AgentLocation;
}
```

---

## API Response Shapes

### Complete field glossary

| Field                  | Source                       | Frontend use                                 |
| ---------------------- | ---------------------------- | -------------------------------------------- |
| `id`                   | users.id                     | Marker key, WebSocket reconciliation         |
| `name`                 | users.name                   | Marker label, sidebar                        |
| `avatar_url`           | CDN URL                      | Marker avatar, popup                         |
| `zone`                 | internal_users.assigned_zone | Filter dropdown, sidebar                     |
| `is_online`            | `last_seen_at` within 5 min  | Marker colour (red = online, grey = offline) |
| `last_seen_at`         | agent_location_snapshots     | "Online" / "12 hours ago" display            |
| `location.latitude`    | GPS                          | Marker `[lng, lat]`                          |
| `location.longitude`   | GPS                          | Marker `[lng, lat]`                          |
| `location.heading`     | GPS compass                  | Rotate marker arrow icon                     |
| `location.speed`       | GPS                          | Info panel (convert m/s → km/h × 3.6)        |
| `location.accuracy`    | GPS                          | Optional accuracy circle radius              |
| `location.recorded_at` | Device clock                 | Stale-data warning if > 2 min old            |
| `current_task`         | tasks table                  | Popup task context                           |

### Null / empty states the frontend must handle

| Scenario                      | What backend sends     | Frontend behaviour                             |
| ----------------------------- | ---------------------- | ---------------------------------------------- |
| Agent never reported location | `"location": null`     | Skip marker; show "No GPS data" in sidebar     |
| Agent is offline              | `"is_online": false`   | Grey marker, show `last_seen_at` relative time |
| Agent has no current task     | `"current_task": null` | Hide task section in popup                     |
| `heading` unavailable         | `"heading": null`      | Show static marker; skip rotation              |

---

## Error Handling

### HTTP Status Codes

| Code  | When                                           | Frontend action                                              |
| ----- | ---------------------------------------------- | ------------------------------------------------------------ |
| `200` | Success                                        | Proceed                                                      |
| `401` | Missing / expired token                        | Redirect to login                                            |
| `403` | User not authorised to view this company's map | Show "Access denied" toast                                   |
| `422` | Mobile app sent invalid coordinates            | Log and retry with back-off                                  |
| `429` | Mobile app is pushing too fast                 | Respect `Retry-After` header; implement exponential back-off |
| `500` | Server error                                   | Toast error; retry once after 3 s                            |

### Error response shape (same envelope)

```json
{
  "success": false,
  "message": "Unauthenticated.",
  "data": null,
  "errors": null
}
```

```json
{
  "success": false,
  "message": "The given data was invalid.",
  "data": null,
  "errors": {
    "latitude": ["The latitude field is required."],
    "longitude": ["The longitude field must be between -180 and 180."]
  }
}
```

---

## Common Pain Points & Debugging

### 1. Markers not moving after WebSocket event fires

**Symptom:** Console shows the event arriving, but the Mapbox marker stays put.

**Cause:** The marker instance stored in `markersRef` is stale because the component re-mounted and `markersRef` was cleared, but the Echo listener is still attached to the old closure.

**Fix:** Call `markersRef.current.get(id)?.setLngLat(...)` inside the Echo listener, not via React state diffing. The Echo subscription must be torn down and re-created in the same `useEffect` that initialises the map.

---

### 2. WebSocket disconnects every ~30 seconds

**Symptom:** Updates stop arriving; browser Network tab shows the WS connection closing with code 1006.

**Cause:** The server-side ping interval is not configured; the connection idles out.

**Fix (Reverb config):**

```php
// config/reverb.php
'pulse_inertia' => 30,   // server sends ping every 30 s
```

**Fix (Echo config):**

```js
window.Echo = new Echo({
  broadcaster: "reverb",
  key: process.env.NEXT_PUBLIC_REVERB_APP_KEY,
  wsHost: process.env.NEXT_PUBLIC_REVERB_HOST,
  wsPort: process.env.NEXT_PUBLIC_REVERB_PORT,
  forceTLS: false,
  enabledTransports: ["ws", "wss"],
  pongTimeout: 6000, // wait 6 s for pong before reconnecting
  activityTimeout: 120000, // 2 min idle before considering connection dead
});
```

---

### 3. Agent position jumps to 0,0 (null island)

**Symptom:** One marker teleports to the Gulf of Guinea.

**Cause:** The mobile app sent `"latitude": null` or `0` when the GPS fix was lost (cold start, tunnel, signal drop). The backend accepted it without validation.

**Fix (Laravel validation rule):**

```php
// app/Http/Requests/UpdateLocationRequest.php
'latitude'  => ['required', 'numeric', 'between:-90,90', 'not_in:0'],
'longitude' => ['required', 'numeric', 'between:-180,180', 'not_in:0'],
```

**Fallback:** The frontend should reject a `location` update where `accuracy > 200` (metres) — that's a GPS fix too poor to trust.

---

### 4. `GET /agents/locations` is slow (> 500 ms)

**Symptom:** The map page has a noticeable loading delay.

**Cause:** The query is doing `MAX(recorded_at)` group-by on the full `agent_locations` history table.

**Fix:** Query `agent_location_snapshots` instead (one row per agent, always current). Response time should drop to < 30 ms for companies with up to 500 agents.

---

### 5. Stale `is_online` flag

**Symptom:** An agent who closed the app 2 hours ago still shows as "online" on the map.

**Cause:** `is_online` is stored as a boolean and never flipped back to `false`.

**Fix (two options):**

**Option A — Derive on read (simpler):**

```php
// In the resource / collection transformer
'is_online' => $snapshot->last_seen_at->diffInMinutes(now()) < 5,
```

**Option B — Scheduled job (more accurate at scale):**

```php
// app/Console/Kernel.php
$schedule->job(new MarkOfflineAgentsJob)->everyMinute();

// MarkOfflineAgentsJob
AgentLocationSnapshot::where('last_seen_at', '<', now()->subMinutes(5))
    ->where('is_online', true)
    ->update(['is_online' => false]);
// Broadcast an AgentWentOffline event so the frontend can grey out the marker
```

---

### 6. Mobile app drains battery pushing every 5 seconds

**Symptom:** Agents complain their phone dies by midday.

**Fix — adaptive update rate:**

- Speed > 5 m/s (moving): push every **10 seconds**
- Speed < 1 m/s (stationary): push every **3 minutes**
- App backgrounded: push every **5 minutes** (OS background task limit)
- Minimum distance threshold: only push if moved > **20 metres** since last push

The backend must also handle **batch pushes** for the offline-flush scenario:

```json
// POST /api/v1/agents/location/batch
{
  "points": [
    {
      "latitude": 6.6,
      "longitude": 3.35,
      "recorded_at": "2026-05-13T09:00:00Z"
    },
    {
      "latitude": 6.601,
      "longitude": 3.351,
      "recorded_at": "2026-05-13T09:00:30Z"
    }
  ]
}
```

---

### 7. Two agents appear at the same location

**Symptom:** Markers overlap; clicking one selects the other.

**Cause:** Mapbox stacks markers at identical coordinates. Happens when two agents are in the same building and the GPS jitter is smaller than the marker pixel size at the current zoom.

**Fix:** Use Mapbox's cluster layer for offline agents, and apply a small angular offset (< 0.0005°) to visually separate co-located markers only at high zoom. Never fake coordinates permanently.

---

### 8. CORS errors from the WebSocket handshake

**Symptom:** The Echo connection fails with a CORS error in the browser console.

**Cause:** The Reverb server's `allowed_origins` doesn't include the Next.js dev/prod origin.

**Fix:**

```php
// config/reverb.php
'apps' => [
    [
        'id'              => env('REVERB_APP_ID'),
        'key'             => env('REVERB_APP_KEY'),
        'secret'          => env('REVERB_APP_SECRET'),
        'options' => [
            'host' => '0.0.0.0',
        ],
        'allowed_origins' => [
            env('FRONTEND_URL', 'http://localhost:3000'),
            'https://dashboard.thefactory23.com',
        ],
        'ping_interval' => 60,
        'activity_timeout' => 30,
    ],
],
```

---

## Security Considerations

| Concern                                            | Mitigation                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Anyone can push fake GPS coordinates               | `POST /agents/location` must be authenticated via Bearer token; the `user_id` must come from the token, never the request body |
| Supervisors viewing other companies' agents        | Channel auth gate in `routes/channels.php` enforces `user.company_id === channelCompanyId`                                     |
| Exposing agent home addresses via location history | Restrict `GET /agents/{id}/location/history` to supervisors and admins; agents may only view their own history                 |
| WebSocket token interception                       | Use WSS (TLS) in production; store the Echo auth token in memory, not localStorage                                             |
| High-frequency push DDoS from a rogue device       | Rate-limit `POST /agents/location` to 1 request per 5 seconds per user via `ThrottleRequests` middleware                       |
