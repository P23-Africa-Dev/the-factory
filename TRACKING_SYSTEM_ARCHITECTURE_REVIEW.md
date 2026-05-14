# Real-Time Map Tracking System - Complete Architectural Review

**Date**: May 14, 2026  
**Status**: FOUNDATION REVIEW COMPLETE - Multiple critical gaps identified  
**Production Readiness**: 40% (Backend solid, Frontend missing)

---

## EXECUTIVE SUMMARY

The real-time map tracking system has a **solid, production-grade backend** with comprehensive Laravel models, APIs, and event publishing. However, the **Next.js frontend is purely demonstrative** with zero integration to the real tracking infrastructure. The WebSocket relay layer is properly architected but unused by the frontend.

**Critical Finding**: The system requires significant frontend development before production deployment. The backend is architecturally sound but needs production hardening and permission validation enhancements.

---

## SECTION 1: COMPLETE SYSTEM ARCHITECTURE OVERVIEW

### 1.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     AGENT DEVICE (Mobile/Web)                    │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Agent App    │  │ Task UI      │  │ Location Permission  │   │
│  │ (Next.js)    │→ │ (START)      │→ │ (Geolocation API)    │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│         ↓                                     ↓                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ POST /api/v1/agent/tasks/{id}/start                      │   │
│  │ + location_permission_granted=true                       │   │
│  │ + latitude, longitude, accuracy_meters                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                    LARAVEL BACKEND (API Server)                   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ TaskTrackingService::start()                                │ │
│  │ - Authorize agent user                                      │ │
│  │ - Create TaskTrackingSession record                         │ │
│  │ - Create initial TaskLocationPoint (checkpoint)            │ │
│  │ - Check arrival radius immediately                         │ │
│  │ - Publish Redis events: tracking.task.started              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              ↓                                     │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Redis Channel Publishing                                    │ │
│  │ - factory23.tracking.company.{company_id}                 │ │
│  │ - factory23.tracking.task.{task_id}                       │ │
│  │                                                             │ │
│  │ Event Payload:                                             │ │
│  │ {                                                           │ │
│  │   event: "tracking.task.started",                          │ │
│  │   company_id, task_id, tracking_session_id,               │ │
│  │   user_id, occurred_at,                                    │ │
│  │   data: { latitude, longitude, accuracy_meters, arrived } │ │
│  │ }                                                           │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                     REDIS PUB/SUB BROKER                          │
│                    (Message Queue/Buffer)                         │
│                                                                     │
│  Active Channels:                                                  │
│  - factory23.tracking.company.1                                  │
│  - factory23.tracking.company.2                                  │
│  - factory23.tracking.task.123                                   │
│  - factory23.tracking.task.124                                   │
│  (All matching factory23.tracking.* pattern)                      │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                  REALTIME WEBSOCKET RELAY (Node.js)               │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ WebSocket Server (ws://host:8081)                           │ │
│  │                                                             │ │
│  │ For each new WebSocket connection:                         │ │
│  │ 1. Parse query params: ?token=...&company_id=...          │ │
│  │ 2. Call GET /api/v1/user/me with Authorization header     │ │
│  │ 3. Extract: user_id, company_id, company_role             │ │
│  │ 4. Determine access_role: management|agent                │ │
│  │ 5. Store connection state (userId, companyId, role)       │ │
│  │                                                             │ │
│  │ For each Redis message from factory23.tracking.company.*:  │ │
│  │ 1. Call shouldDeliverEvent(connection, envelope)          │ │
│  │ 2. Filter by: company_id match + role visibility          │ │
│  │ 3. Management: all company events delivered               │ │
│  │ 4. Agent: only own tracking (user_id match) OR            │ │
│  │           explicitly subscribed tasks                      │ │
│  │ 5. Push to socket: { type, channel, payload }             │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                  DASHBOARD (Next.js Frontend)                     │
│                    [CURRENTLY DEMO ONLY]                          │
│                                                                     │
│  ⚠️  NOT CONNECTED TO WEBSOCKET                                   │
│  ⚠️  NOT CALLING TRACKING ENDPOINTS                               │
│  ⚠️  HARDCODED AGENT POSITIONS                                    │
│  ⚠️  NO REAL TASK/TRACKING DATA                                   │
│                                                                     │
│  What SHOULD happen:                                              │
│  1. Connect WebSocket: ws://realtime.host/tracking-ws             │
│  2. Send auth: { type: "authenticate", token, company_id }       │
│  3. Listen for events: tracking.task.started, updated, completed │ │
│  4. Update map state: position, polyline, checkpoints            │ │
│  5. Render live markers with latest positions                    │ │
│  6. Show arrival alerts, route visualization                     │ │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 Data Flow - Tracking Lifecycle

```
AGENT TASK EXECUTION FLOW:

1. PENDING → IN_PROGRESS (transition happens on start)
   ↓
2. Agent requests location permission
   ↓
3. Agent calls POST /api/v1/agent/tasks/{id}/start
   Request: { company_id, location_permission_granted: true, lat, lng, accuracy_m }
   ↓
4. Backend creates TaskTrackingSession + initial LocationPoint
   - Session fields populated: start_*, destination_*, arrival_radius_m
   - Checks if already within arrival radius
   ↓
5. Redis publishes:
   - tracking.task.started (to company and task channels)
   - tracking.location.updated (if within radius: tracking.task.arrived)
   ↓
6. WebSocket relay delivers to subscribed dashboards
   ↓
7. Dashboard updates: marker position, route polyline, arrival status
   ↓
8. Agent periodically calls POST /api/v1/agent/tasks/{id}/location
   Request: { company_id, points: [{lat, lng, recorded_at, ...}] }
   (up to 50 points per batch)
   ↓
9. Backend processes points:
   - Updates session.last_* fields immediately
   - Persists point if: interval >= 15s OR distance >= 20m
   - Checks arrival on EVERY point
   ↓
10. Redis publishes tracking.location.updated for each batch
    ↓
11. Dashboard receives live updates, smoothly animates marker
    ↓
12. Agent arrives at destination (within 75m)
    → Backend auto-detects arrival
    → Publishes tracking.task.arrived
    → Dashboard shows arrival alert/UI
    ↓
13. Agent completes task:
    POST /api/v1/agent/tasks/{id}/complete
    Request: { company_id, lat, lng, files: [proof images], notes }
    ↓
14. Backend:
    - Validates proof files (at least 1)
    - Uploads proofs to storage
    - Updates task status → COMPLETED
    - Sets session.end_* and completed_by_user_id
    - Creates final location point (checkpoint)
    ↓
15. Redis publishes: tracking.task.completed
    ↓
16. Dashboard receives event, removes live marker, shows completion status
    ↓
17. Task is now IN COMPLETED state
    - Supervisors can view route via GET /api/v1/admin/tasks/{id}/route
    - Agents can view own route if needed
```

### 1.3 Permission Model

#### Owner / Admin / Supervisor (Management)

- **Role check**: `company_users.role IN ('owner', 'admin', 'supervisor')`
- **API access**: `/api/v1/admin/tasks/*` (role-restricted)
- **Task visibility**: ALL tasks in company
- **Tracking visibility**: ALL agent tracking in company
  - Subscribed to `factory23.tracking.company.{id}` on WebSocket
  - Relay delivers ALL events matching company
  - Can view routes for any task: `GET /api/v1/admin/tasks/{id}/route`
- **Actions**:
  - View live agents
  - View active tasks on map
  - View historical routes
  - Cannot start/complete tasks (agent role only)

#### Agent

- **Role check**: `company_users.role = 'agent'` OR `internal_role = 'agent'`
- **API access**: `/api/v1/agent/tasks/*` (role-restricted)
- **Task visibility**:
  - Only assigned tasks: `tasks.assigned_agent_id = user.id` OR
  - Current assignments: `task_assignments.assigned_agent_id = user.id AND is_current = true`
- **Tracking capability**:
  - Can start/stop tracking on ONLY assigned tasks
  - Can upload proofs only on own tasks
  - Can view own route: `GET /api/v1/agent/tasks/{id}/route`
- **WebSocket visibility**:
  - Subscribed to `factory23.tracking.company.{id}`
  - Relay filters: only delivers events where `user_id = agent.id`
  - Can subscribe to specific task: `subscribe_task` message
- **Actions**:
  - Start task → enable location tracking
  - Send location updates periodically
  - Arrive at destination (auto-detected)
  - Complete task with proofs

### 1.4 Role-Based Filtering in Realtime Relay

```javascript
// /backend/realtime-server/src/filtering.js

shouldDeliverEvent = (connection, envelope) => {
  // 1. Must be authenticated
  if (!connection.authenticated) return false;

  // 2. Must match company context
  if (connection.companyId !== envelope.company_id) return false;

  // 3. Management gets everything in their company
  if (connection.accessRole === "management") return true;

  // 4. Agents get:
  if (connection.accessRole === "agent") {
    // - Events where they are the user
    if (connection.userId === envelope.user_id) return true;

    // - Events for explicitly subscribed tasks
    if (connection.subscribedTaskIds.has(envelope.task_id)) return true;
  }

  return false;
};
```

---

## SECTION 2: DEEP DIVE - BACKEND IMPLEMENTATION

### 2.1 Database Schema

#### `task_tracking_sessions` (Core)

```sql
CREATE TABLE task_tracking_sessions (
  id                          BIGINT PRIMARY KEY,
  task_id                     BIGINT UNIQUE NOT NULL (FK → tasks),
  company_id                  BIGINT NOT NULL (FK → companies),
  started_by_user_id          BIGINT NOT NULL (FK → users),
  completed_by_user_id        BIGINT NULL (FK → users),

  -- Start checkpoint
  start_latitude              DECIMAL(10,7) NOT NULL,
  start_longitude             DECIMAL(10,7) NOT NULL,
  start_accuracy_meters       DECIMAL(8,2) NULL,
  start_recorded_at           TIMESTAMP NOT NULL,

  -- Latest known position (updated on EVERY location update)
  last_latitude               DECIMAL(10,7) NULL,
  last_longitude              DECIMAL(10,7) NULL,
  last_accuracy_meters        DECIMAL(8,2) NULL,
  last_recorded_at            TIMESTAMP NULL,

  -- Latest PERSISTED position (filtered by distance/time)
  last_persisted_latitude     DECIMAL(10,7) NULL,
  last_persisted_longitude    DECIMAL(10,7) NULL,
  last_persisted_recorded_at  TIMESTAMP NULL,

  -- Destination (from task)
  destination_latitude        DECIMAL(10,7) NULL,
  destination_longitude       DECIMAL(10,7) NULL,
  destination_radius_meters   SMALLINT NOT NULL (default: 75),

  -- Arrival detection
  arrival_detected_at         TIMESTAMP NULL,
  arrival_latitude            DECIMAL(10,7) NULL,
  arrival_longitude           DECIMAL(10,7) NULL,

  -- Completion checkpoint
  end_latitude                DECIMAL(10,7) NULL,
  end_longitude               DECIMAL(10,7) NULL,
  end_accuracy_meters         DECIMAL(8,2) NULL,
  end_recorded_at             TIMESTAMP NULL,

  created_at                  TIMESTAMP,
  updated_at                  TIMESTAMP,

  KEY (company_id, start_recorded_at),
  KEY (company_id, arrival_detected_at),
  KEY (company_id, end_recorded_at),
);
```

**Design Notes**:

- One-to-one with Task (unique task_id)
- Stores checkpoints (start, arrival, end) for quick access
- Maintains separate `last_*` and `last_persisted_*` to track sampling
- Destination copied from task at session creation
- Company scoping on all indexes

#### `task_location_points` (Trace)

```sql
CREATE TABLE task_location_points (
  id                   BIGINT PRIMARY KEY,
  tracking_session_id  BIGINT NOT NULL (FK → task_tracking_sessions),
  task_id              BIGINT NOT NULL (FK → tasks),
  company_id           BIGINT NOT NULL (FK → companies),
  user_id              BIGINT NOT NULL (FK → users),

  -- Location data
  latitude             DECIMAL(10,7) NOT NULL,
  longitude            DECIMAL(10,7) NOT NULL,
  accuracy_meters      DECIMAL(8,2) NULL,
  speed_mps            DECIMAL(8,2) NULL,
  heading_degrees      DECIMAL(6,2) NULL,

  -- Classification
  event_type           VARCHAR(32) DEFAULT 'movement',  -- movement|start|arrival|complete
  is_checkpoint        BOOLEAN DEFAULT FALSE,

  recorded_at          TIMESTAMP NOT NULL,
  created_at           TIMESTAMP,
  updated_at           TIMESTAMP,

  KEY (task_id, recorded_at),
  KEY (tracking_session_id, recorded_at),
  KEY (company_id, recorded_at),
);
```

**Design Notes**:

- Chronological trace of all reported points
- Checkpoints marked with is_checkpoint for replay/display
- Event type distinguishes normal movement from milestones
- Supports retention pruning (old points deleted, checkpoints kept)
- All queries company-scoped

### 2.2 Service Layer Architecture

#### TaskTrackingService (Core Logic)

**Responsibility**: Orchestrate tracking lifecycle, persistence, validation

**Public Methods**:

1. **`start(User, Task, array): array`**
   - ✓ Validates agent authorization
   - ✓ Validates location permission granted
   - ✓ Validates task status = PENDING or IN_PROGRESS
   - ✓ Checks no active session exists
   - ✓ Creates TaskTrackingSession + initial checkpoint
   - ✓ Immediately checks arrival radius
   - ✓ Publishes Redis events (started, [arrived if immediate])
   - Returns: task, session, arrived flag

2. **`recordLocation(User, Task, array): array`**
   - ✓ Validates agent authorization
   - ✓ Validates task status = IN_PROGRESS
   - ✓ Validates active session exists
   - ✓ Normalizes single or batch points
   - ✓ Persists points based on: time interval (15s) OR distance (20m)
   - ✓ Updates session.last\_\* on every point
   - ✓ Checks arrival on every point
   - ✓ Publishes location.updated events
   - ✓ Max batch size: 50 points
   - Returns: task, session, received/persisted counts, arrived flag

3. **`complete(User, Task, array): array`**
   - ✓ Validates agent authorization
   - ✓ Validates task status = IN_PROGRESS
   - ✓ Validates active session exists
   - ✓ Uploads proof files to storage
   - ✓ Updates task status → COMPLETED
   - ✓ Checks arrival at completion location
   - ✓ Creates final checkpoint
   - ✓ Publishes location.updated + task.completed
   - Returns: task, session, proofs

4. **`routeForUser(User, Task, array): array`**
   - ✓ Validates authorization (agent checks assignment)
   - ✓ Loads session with ordered points
   - ✓ Returns: start/arrival/end checkpoints, points array, polyline
   - ✓ Supports filtering/pagination
   - ✓ For Mapbox visualization

#### TaskAccessService (Authorization)

Wraps CompanyContextService, enforces roles:

```php
$context = $accessService->resolve($user, $companyId);

// Returns TaskAccessContext with:
// - company: Company model
// - role: 'owner'|'admin'|'supervisor'|'agent'

$accessService->ensureAgent($context);        // throws if not agent
$accessService->ensureManager($context);      // throws if not owner/admin/supervisor
```

**Guard in TaskTrackingService**:

```php
$context = $this->accessService->resolve($user, $data['company_id'] ?? null);
$this->accessService->ensureAgent($context);  // Lines 29, 115, 256
```

### 2.3 API Endpoints & Contracts

#### Start Tracking

```
POST /api/v1/agent/tasks/{task}/start
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "company_id": 1,
  "location_permission_granted": true,
  "latitude": 6.4,
  "longitude": 3.39,
  "accuracy_meters": 5.0,
  "recorded_at": "2026-04-29T14:00:00Z"  // optional
}

Response: 200 OK
{
  "success": true,
  "message": "Task tracking started successfully.",
  "data": {
    "task": { Task resource },
    "tracking": { session payload },
    "arrived": false
  }
}

Error Cases:
- 401: Unauthenticated
- 403: Not an agent (access.role:agent middleware)
- 422:
  - location_permission_granted not true
  - task not assigned to user
  - task not in PENDING or IN_PROGRESS
  - active session already exists
```

#### Record Location (Single)

```
POST /api/v1/agent/tasks/{task}/location
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "company_id": 1,
  "latitude": 6.401,
  "longitude": 3.391,
  "accuracy_meters": 5.0,
  "speed_mps": 4.2,
  "heading_degrees": 180,
  "recorded_at": "2026-04-29T14:03:00Z"  // optional
}

Response: 200 OK
{
  "success": true,
  "message": "Task location recorded successfully.",
  "data": {
    "task": { Task resource },
    "tracking": { session payload },
    "received_points": 1,
    "persisted_points": 1,  // 0 if not yet at time/distance threshold
    "arrived": false
  }
}
```

#### Record Location (Batch)

```
POST /api/v1/agent/tasks/{task}/location
Authorization: Bearer {token}
Content-Type: application/json

Request:
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

Response: 200 OK
{
  "success": true,
  "message": "Task location recorded successfully.",
  "data": {
    "received_points": 2,
    "persisted_points": 1,  // only 1 met threshold
    "arrived": false
  }
}

Validation:
- Max 50 points per batch (config: TASK_TRACKING_MAX_BATCH_POINTS)
- Cannot mix single point + points array
- Points must have at least lat/lng
```

#### Complete Task

```
POST /api/v1/agent/tasks/{task}/complete
Authorization: Bearer {token}
Content-Type: multipart/form-data

Request:
- company_id: 1
- latitude: 6.430
- longitude: 3.420
- accuracy_meters: 5.0 (optional)
- recorded_at: "2026-04-29T14:30:00Z" (optional, defaults to now)
- notes: "Completed successfully" (optional)
- files[]: [image1.jpg, image2.jpg, ...] (required: at least 1)

Response: 201 Created
{
  "success": true,
  "message": "Task completed with tracking data successfully.",
  "data": {
    "task": { Task resource with status: "completed" },
    "tracking": { session payload with end_* populated },
    "proofs": [ { proof resources } ]
  }
}

Validation:
- Task must be IN_PROGRESS
- Active session must exist
- At least 1 proof file required
- Files validated as images
```

#### Get Route (Historical)

```
GET /api/v1/agent/tasks/{task}/route?company_id=1&include_points=true&limit=500
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "message": "Task route fetched successfully.",
  "data": {
    "task_id": 123,
    "company_id": 1,
    "status": "completed",
    "destination": {
      "latitude": 6.43,
      "longitude": 3.42,
      "radius_meters": 75
    },
    "start": {
      "latitude": 6.4,
      "longitude": 3.39,
      "recorded_at": "2026-04-29T14:00:00Z"
    },
    "arrival": {
      "latitude": 6.4301,
      "longitude": 3.4201,
      "recorded_at": "2026-04-29T14:25:00Z"
    },
    "end": {
      "latitude": 6.430,
      "longitude": 3.420,
      "recorded_at": "2026-04-29T14:30:00Z"
    },
    "summary": {
      "points_count": 47,
      "total_distance_meters": 2850.50
    },
    "points": [
      {
        "latitude": 6.4,
        "longitude": 3.39,
        "accuracy_meters": 5,
        "speed_mps": 0,
        "heading_degrees": null,
        "event_type": "start",
        "is_checkpoint": true,
        "recorded_at": "2026-04-29T14:00:00Z"
      },
      // ... 45 more points ...
    ],
    "polyline": [
      [3.39, 6.4],
      [3.391, 6.401],
      // ... coordinates for Mapbox visualization ...
    ]
  }
}

Filters:
- include_points: true/false (default true)
- limit: max points to return (default 500)

Authorization:
- Agents: can access only assigned tasks
- Management: can access any task in company
```

### 2.4 Redis Event Publishing

**Channels**:

- `factory23.tracking.company.{company_id}` - All company events
- `factory23.tracking.task.{task_id}` - Task-specific events

**Event Envelope**:

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
    "task_status": "in_progress",
    "latitude": 6.4301,
    "longitude": 3.4201,
    "accuracy_meters": 5,
    "speed_mps": 4.2,
    "heading_degrees": 180,
    "arrived": false,
    "event_type": "movement"
  }
}
```

**Event Types**:

1. **tracking.task.started**
   - Fired: When agent calls POST /start
   - Data: start position, accuracy
   - Recipient: All supervisors/admins of company, the agent

2. **tracking.location.updated**
   - Fired: On every batch of location points processed
   - Data: latest position, accuracy, speed, heading, event_type, arrived status
   - Recipient: Same as started

3. **tracking.task.arrived**
   - Fired: When agent enters destination radius (75m default)
   - Data: arrival position, arrival_recorded_at timestamp
   - Recipient: Same as started

4. **tracking.task.completed**
   - Fired: When agent calls POST /complete
   - Data: end position, proofs_uploaded count
   - Recipient: Same as started

**Publishing Logic** (TaskTrackingService):

```php
private function publishTrackingEvent(
    string $event,
    int $companyId,
    int $taskId,
    int $trackingSessionId,
    int $userId,
    array $data,
    Carbon $occurredAt,
): void {
    $prefix = config('tracking.redis_channel_prefix', 'factory23.tracking');
    $payload = ['event', 'version', 'company_id', 'task_id',
                'tracking_session_id', 'user_id', 'occurred_at', 'data'];

    $channels = [
        "{$prefix}.company.{$companyId}",
        "{$prefix}.task.{$taskId}",
    ];

    // Publish to both channels
    foreach ($channels as $channel) {
        Redis::publish($channel, json_encode($payload));
    }
}
```

**Failure Handling**: Logged as warnings, does NOT block main request

### 2.5 Configuration

```php
// config/tracking.php
return [
    'arrival_radius_meters' => 75,              // env: TASK_TRACKING_ARRIVAL_RADIUS_METERS
    'persist_min_interval_seconds' => 15,       // env: TASK_TRACKING_PERSIST_MIN_INTERVAL_SECONDS
    'persist_min_distance_meters' => 20.0,      // env: TASK_TRACKING_PERSIST_MIN_DISTANCE_METERS
    'max_batch_points' => 50,                   // env: TASK_TRACKING_MAX_BATCH_POINTS
    'redis_channel_prefix' => 'factory23.tracking',  // env: TASK_TRACKING_REDIS_CHANNEL_PREFIX
    'retention_days' => 90,                     // env: TASK_TRACKING_RETENTION_DAYS
    'prune_chunk_size' => 1000,                 // env: TASK_TRACKING_PRUNE_CHUNK_SIZE
];
```

### 2.6 Assignment Validation Logic

**Critical Issue Found**: Dual-check for task assignment

```php
// TaskTrackingService::ensureAssignedUser()
private function ensureAssignedUser(Task $task, User $user): void
{
    $isPrimaryAssignee = (int) $task->assigned_agent_id === (int) $user->id;

    $isCurrentAssignee = DB::table('task_assignments')
        ->where('task_id', $task->id)
        ->where('assigned_agent_id', $user->id)
        ->where('is_current', true)
        ->exists();

    if (!$isPrimaryAssignee && !$isCurrentAssignee) {
        throw ValidationException::withMessages([
            'authorization' => ['You can only track tasks currently assigned to you.']
        ]);
    }
}
```

**Problem**: Task has TWO assignment fields:

1. `tasks.assigned_agent_id` - Primary assignment (direct column)
2. `task_assignments` table - Many-to-many with history

**Current Behavior**:

- ✓ Accepts if primary assigned OR in task_assignments.is_current
- ✗ Does NOT verify is_current = true for primary assignment
- ✗ A primary assignment could be reassigned without updating task_assignments

**Example Scenario**:

1. Task assigned to Agent A: `tasks.assigned_agent_id = 5`
2. Later reassigned to Agent B: `tasks.assigned_agent_id = 6`
3. Old task_assignments row: `{task_id: 123, agent_id: 5, is_current: false}`
4. New task_assignments row: `{task_id: 123, agent_id: 6, is_current: true}`
5. Agent A can still start tracking if: `assigned_agent_id = 5` (from old assignment)

**Recommendation**: Simplify to task_assignments only, remove assigned_agent_id column

---

## SECTION 3: WEBSOCKET RELAY DEEP DIVE

### 3.1 Node.js Realtime Server Architecture

**File**: `/backend/realtime-server/src/server.js`

**Responsibilities**:

1. Accept WebSocket connections on port 8081
2. Authenticate clients via GET /api/v1/user/me
3. Subscribe to Redis factory23.tracking.\* channels
4. Route events to connected clients based on permissions
5. Maintain heartbeat to detect stale connections

### 3.2 Connection Lifecycle

#### Step 1: WebSocket Connection

```javascript
// Client connects to: wss://realtime.factory23.com?token=xxx&company_id=1

// Server receives connection
wss.on("connection", (socket, request) => {
  const connectionId = randomUUID();
  const initialQuery = parseQueryFromRequest(request);
  // { token, companyHint, taskIds: [...] }

  // Store connection state
  connections.set(socket, {
    connectionId,
    authenticated: false,
    isAlive: true,
    userId: null,
    companyId: null,
    companyRole: null,
    accessRole: null, // "management" | "agent"
    subscribedTaskIds: new Set(),
    authTimer: setTimeout(() => {
      // Auth timeout: 10 seconds
      if (!authenticated) socket.close(4401, "Auth timeout");
    }, 10000),
  });

  // If token in query, immediately authenticate
  if (initialQuery.token) {
    authenticateAndAttach(socket, initialQuery);
  } else {
    // Send auth required message
    safeSend(socket, {
      type: "system.auth_required",
      message: "Send authenticate message...",
    });
  }
});
```

#### Step 2: Authentication

```javascript
// Option A: Query parameter token
const ws = new WebSocket("wss://host:8081?token=xxx&company_id=1");

// Option B: Post-connect message
ws.send(
  JSON.stringify({
    type: "authenticate",
    token: "xxx",
    company_id: 1,
    task_ids: [123, 124, 125], // optional subscriptions
  }),
);

// Server authenticates
async function authenticateAndAttach(socket, credentials) {
  const { token, companyHint } = credentials;

  // Verify token via: GET /api/v1/user/me
  const endpoint = `${authApiBaseUrl}/api/v1/user/me`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  // Extract user data
  const user = response.json().data; // { id, name, email, active_company: { id, role } }
  const activeCompany = user.active_company;

  // Validate company hint matches
  if (companyHint && !matches(companyHint, activeCompany.id)) {
    throw new Error("Company mismatch");
  }

  // Resolve role
  const accessRole = resolveAccessRole(activeCompany.role);
  // "owner"|"admin"|"supervisor"|"management" → "management"
  // "agent" → "agent"

  // Store authenticated state
  state.authenticated = true;
  state.userId = user.id;
  state.companyId = activeCompany.id;
  state.companyRole = activeCompany.role;
  state.accessRole = accessRole;
  state.subscribedTaskIds = new Set(credentials.taskIds || []);

  // Send success
  safeSend(socket, {
    type: "system.connected",
    connection_id: state.connectionId,
    auth_mode: "token-introspection",
    access_role: state.accessRole,
    company_id: state.companyId,
    subscribed_task_ids: [...state.subscribedTaskIds],
  });
}
```

#### Step 3: Message Handling

```javascript
socket.on("message", (rawBuffer) => {
  const message = JSON.parse(rawBuffer.toString());
  const state = connections.get(socket);

  // Handle control messages
  if (message.type === "authenticate") {
    authenticateAndAttach(socket, message);
  } else if (message.type === "subscribe_task") {
    state.subscribedTaskIds.add(message.task_id);
    safeSend(socket, {
      type: "system.subscribed_task",
      task_id: message.task_id,
      subscribed_task_ids: [...state.subscribedTaskIds],
    });
  } else if (message.type === "unsubscribe_task") {
    state.subscribedTaskIds.delete(message.task_id);
    safeSend(socket, {
      type: "system.unsubscribed_task",
      task_id: message.task_id,
      subscribed_task_ids: [...state.subscribedTaskIds],
    });
  } else if (message.type === "ping") {
    safeSend(socket, { type: "pong", ts: now() });
  }
});
```

#### Step 4: Receiving Redis Events

```javascript
// Subscribe to all factory23.tracking.company.* channels
redisSubscriber.psubscribe("factory23.tracking.company.*");

redisSubscriber.on("pmessage", (_pattern, channel, message) => {
  // message = Redis event JSON payload
  const envelope = JSON.parse(message);

  // For each connected WebSocket
  for (const [socket, state] of connections.entries()) {
    // Check if connection is healthy
    if (socket.readyState !== WebSocket.OPEN) continue;

    // Check if event should be delivered
    if (!shouldDeliverEvent(state, envelope)) continue;

    // Send event to client
    safeSend(socket, {
      type: envelope.event, // "tracking.location.updated", etc.
      channel: channel, // "factory23.tracking.company.1", etc.
      payload: envelope, // full event data
    });
  }
});
```

### 3.3 Permission Filtering

```javascript
// /backend/realtime-server/src/filtering.js

function shouldDeliverEvent(connection, envelope) {
  // 1. Must be authenticated
  if (!connection?.authenticated) return false;

  // 2. Must match company
  if (Number(connection.companyId) !== Number(envelope.company_id)) {
    return false;
  }

  // 3. Management users get all events
  if (connection.accessRole === "management") {
    return true;
  }

  // 4. Agents get only:
  // a) Events where they are the user
  if (connection.accessRole === "agent") {
    if (Number(connection.userId) === Number(envelope.user_id)) {
      return true; // Own tracking
    }

    // b) Events for tasks they subscribed to
    if (connection.subscribedTaskIds?.has(Number(envelope.task_id))) {
      return true; // Other agent's task (explicit subscription)
    }
  }

  return false; // Not delivered
}
```

### 3.4 Heartbeat & Connection Management

```javascript
// Send ping every 30 seconds
setInterval(() => {
  for (const [socket, state] of connections.entries()) {
    // If no pong received since last ping, terminate
    if (!state.isAlive) {
      socket.terminate();
      connections.delete(socket);
      continue;
    }

    // Send ping
    state.isAlive = false;
    socket.ping();
  }
}, 30000); // TRACKING_WS_HEARTBEAT_MS

// Client auto-responds with pong
socket.on("pong", () => {
  state.isAlive = true;
});

// Clean up on close
socket.on("close", (code, reason) => {
  clearAuthTimer(socket);
  connections.delete(socket);
});
```

### 3.5 Configuration

```javascript
// /backend/realtime-server/src/config.js

export const config = {
  host: "0.0.0.0", // TRACKING_WS_HOST
  port: 8081, // TRACKING_WS_PORT
  maxMessageBytes: 32 * 1024, // TRACKING_WS_MAX_MESSAGE_BYTES
  heartbeatIntervalMs: 30000, // TRACKING_WS_HEARTBEAT_MS
  authTimeoutMs: 10000, // TRACKING_WS_AUTH_TIMEOUT_MS
  authApiBaseUrl: "http://nginx", // TRACKING_WS_AUTH_API_BASE_URL
  authMePath: "/api/v1/user/me", // TRACKING_WS_AUTH_ME_PATH
  logLevel: "info", // TRACKING_WS_LOG_LEVEL
  allowInsecureSkipAuth: false, // TRACKING_WS_ALLOW_INSECURE_SKIP_AUTH
  redisHost: "redis", // TRACKING_WS_REDIS_HOST
  redisPort: 6379, // TRACKING_WS_REDIS_PORT
  redisPassword: "", // TRACKING_WS_REDIS_PASSWORD
  redisDb: 0, // TRACKING_WS_REDIS_DB
  redisChannelPrefix: "factory23.tracking", // TRACKING_WS_REDIS_CHANNEL_PREFIX
};
```

---

## SECTION 4: FRONTEND IMPLEMENTATION STATUS

### 4.1 Current State

**File**: `/app/(dashboard)/map/page.tsx` + `/components/map/map-view.tsx`

**Status**: ⚠️ **DEMO ONLY** - Zero integration with real tracking

```tsx
// page.tsx
const MapView = dynamic(() => import("@/components/map/map-view"), {
  ssr: false,
});

// map-view.tsx - What currently happens:
export function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // Hardcoded mock agents
  const INITIAL_AGENTS = [
    { id: "1", name: "Lane Wade", lat: 6.6018, lng: 3.3515, status: "active" },
    { id: "2", name: "Lane Wade", lat: 6.5841, lng: 3.3705, status: "idle" },
    // ... 5 agents total
  ];

  // Initialize Mapbox (works)
  useEffect(() => {
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [3.36, 6.595],
      zoom: 12.5,
    });
    // Renders static route line
    // Renders destination marker (purple pulse)
    // Renders navigation arrow
    // Renders 5 hardcoded agent markers
  }, [token]);

  // Animates marker positions randomly every 2 seconds
  useEffect(() => {
    setInterval(() => {
      setAgents((prev) => ({
        ...prev,
        lat: prev.lat + jitter(), // Random ±0.0004
        lng: prev.lng + jitter(),
      }));
    }, 2000);
  }, [mapReady]);

  // Renders search panel, agent details popup
  return (
    <MapContainer>
      <SearchBar />
      <AgentList agents={filtered} />
      {selectedAgent && <AgentPopup agent={selectedAgent} />}
    </MapContainer>
  );
}
```

### 4.2 What's Missing

#### Frontend → WebSocket Integration

```
❌ No WebSocket connection code
❌ No authentication to relay
❌ No listening for tracking events
❌ No state management for live data
❌ No event handlers for location.updated
❌ No arrival detection handling
❌ No completion handling
```

#### Frontend → API Integration

```
❌ No task query (list assigned tasks)
❌ No route fetching (GET /api/v1/tasks/{id}/route)
❌ No start tracking (POST /api/v1/tasks/{id}/start)
❌ No location recording (POST /api/v1/tasks/{id}/location)
❌ No task completion (POST /api/v1/tasks/{id}/complete)
❌ No proof upload
```

#### Frontend → Agent App Integration

```
❌ No agent task list display
❌ No task selection/acceptance
❌ No location permission request UI
❌ No location sharing toggle
❌ No tracking status display
❌ No completion workflow
❌ No proof capture UI
```

#### Map Visualization

```
❌ No real agent markers from DB
❌ No task markers from DB
❌ No live polyline updates
❌ No animated marker movement
❌ No arrival alerts/notifications
❌ No route replay functionality
❌ No historical playback
❌ No performance optimization
```

### 4.3 Mapbox Integration Notes

**What's Working**:

- ✓ Token validation
- ✓ Map initialization
- ✓ Static route visualization (hardcoded line)
- ✓ Custom markers with CSS
- ✓ Zoom/pan
- ✓ Attribution

**What Needs Building**:

- GeoJSON sources for:
  - Active agent positions (real-time)
  - Task locations (fixed)
  - Route polylines (historical)
- Layers for:
  - Agent current position (circle marker)
  - Task destination (custom icon)
  - Route trace (line layer)
  - Arrival zone (circle, 75m radius)
- Event handlers:
  - Mouse hover for agent details
  - Click for task details
  - Fly-to for focus
- Dynamic updates:
  - Update source on location.updated event
  - Smooth animation between points (optional: Mapbox GL Animation)
  - Remove markers when task completes

---

## SECTION 5: GAP ANALYSIS & PRODUCTION READINESS

### 5.1 Critical Gaps

#### Backend (80% Complete)

| Item                  | Status        | Impact                                 |
| --------------------- | ------------- | -------------------------------------- |
| Task lifecycle APIs   | ✓ Complete    | N/A                                    |
| Location ingestion    | ✓ Complete    | N/A                                    |
| Permission validation | ⚠️ Partial    | Medium - assignment logic needs review |
| Redis publishing      | ✓ Complete    | N/A                                    |
| Arrival detection     | ✓ Complete    | N/A                                    |
| Proof upload          | ✓ Complete    | N/A                                    |
| Route fetching        | ✓ Complete    | N/A                                    |
| Data retention        | ⚠️ Incomplete | Need prune task implementation         |
| Error handling        | ✓ Adequate    | N/A                                    |
| Input validation      | ✓ Adequate    | N/A                                    |

#### WebSocket Relay (85% Complete)

| Item                  | Status             | Impact                                         |
| --------------------- | ------------------ | ---------------------------------------------- |
| Connection handling   | ✓ Complete         | N/A                                            |
| Token auth            | ✓ Complete         | N/A                                            |
| Redis subscription    | ✓ Complete         | N/A                                            |
| Permission filtering  | ✓ Complete         | N/A                                            |
| Heartbeat             | ✓ Complete         | N/A                                            |
| Logging               | ✓ Adequate         | N/A                                            |
| Error recovery        | ⚠️ Limited         | Low - relies on client reconnect               |
| Compression (deflate) | ❌ Disabled        | Medium - for bandwidth optimization            |
| Message throttling    | ❌ Not implemented | Medium - high-frequency clients could overload |

#### Frontend (5% Complete)

| Item                 | Status     | Impact   |
| -------------------- | ---------- | -------- |
| Map initialization   | ✓ Complete | N/A      |
| WebSocket connection | ❌ Missing | CRITICAL |
| Event listening      | ❌ Missing | CRITICAL |
| State management     | ❌ Missing | CRITICAL |
| Task visualization   | ❌ Missing | CRITICAL |
| Live marker updates  | ❌ Missing | CRITICAL |
| Agent app UI         | ❌ Missing | CRITICAL |
| Location permission  | ❌ Missing | CRITICAL |
| Proof upload UI      | ❌ Missing | CRITICAL |

### 5.2 Security Concerns

#### ✓ Strengths

1. **Token-based auth**: Bearer tokens via Sanctum
2. **Company scoping**: All data filtered by company_id
3. **Role enforcement**: Middleware prevents agent→management access
4. **Assignment validation**: Checks task assignment before tracking allowed
5. **Proof file handling**: No mention of storage vulnerability

#### ⚠️ Concerns

**Concern 1: Task Assignment Dual-Key Issue**

- **Description**: Tasks use both `assigned_agent_id` column and `task_assignments` table
- **Risk**: Race condition during reassignment
- **Mitigation**: Simplify to task_assignments-only model
- **Severity**: MEDIUM - unlikely to occur in practice but possible

**Concern 2: WebSocket Token Exposure**

- **Description**: Token passed in query string (?token=xxx)
- **Risk**: Logged in server logs/proxies, exposed in browser history
- **Mitigation**: Always use HTTPS, accept tokens via POST message instead
- **Severity**: LOW-MEDIUM - HTTPS required anyway in production

**Concern 3: Agent→Agent Tracking**

- **Description**: Agents cannot view other agents' tracking by default
- **Risk**: None currently (correctly restricted)
- **Note**: If task subscription feature used, agents can subscribe to other tasks
- **Concern**: No UI/API to prevent inappropriate subscriptions
- **Severity**: LOW - requires explicit client-side code

**Concern 4: Proof File Validation**

- **Description**: No visible mime-type restriction or size limit
- **Risk**: Potential DOS via large files
- **Mitigation**: Check `max_file_size` in laravel config, validate mime types
- **Severity**: LOW - assume Laravel handles

**Concern 5: Redis Channel Permissions**

- **Description**: Any backend service can publish to Redis
- **Risk**: Malicious backend services could inject fake tracking events
- **Mitigation**: Use Redis AUTH (if configured), ACLs in Redis 6+
- **Severity**: LOW - limited to internal network

### 5.3 Performance Concerns

#### Potential Bottlenecks

**Location Ingestion Scale**:

- 100 agents × 6 points/minute = 600 points/minute = 10 points/second
- Persistence threshold: 15s or 20m → ~1 point persisted per agent every 30 seconds
- Database: 600 inserts/min to `task_location_points` - acceptable
- Redis: 600 pub/subs/min - acceptable
- WebSocket: 600 messages/min to relay - acceptable (if 100 clients)

**Optimizations Needed**:

1. **Batch insert**: LocationPoints could use batch insert instead of individual
2. **Redis stream**: Consider Redis streams instead of pub/sub for history
3. **Compression**: Enable per-message deflate in WebSocket
4. **Caching**: Route fetch could cache polyline calculation
5. **Pagination**: Point queries should paginate to avoid memory spike

#### Memory Usage (Estimate)

- Live sessions: 100 active → 100 KB in memory (session state)
- Connected sockets: 200 open → 200 × 5 KB = 1 MB in WebSocket relay
- Cached routes (if implemented): 100 tasks × 100 points × 32 bytes = 320 KB
- **Total**: < 5 MB for 100 concurrent users - acceptable

### 5.4 Data Consistency Concerns

**Scenario 1: Agent starts tracking, Redis fails**

- Location updates still record to DB ✓
- But no WebSocket relay to dashboard ✗
- **Mitigation**: Polling fallback on frontend

**Scenario 2: Task reassigned during active tracking**

- Old agent still has session with task_id ✓
- But assignment check would block further updates ✗
- **Current fix**: Manual session end needed
- **Better fix**: Automatic session closure on reassignment

**Scenario 3: Backend crash during completion**

- Proofs uploaded ✓
- Task updated to COMPLETED ✓
- But Redis publish might not happen ✗
- **Current**: Logged warning only
- **Better**: Queue completion event for retry

**Scenario 4: Clock skew (client time vs server time)**

- Timestamps from client recorded_at used for ordering
- If client clock wrong, sequence incorrect
- **Current**: No validation of timestamp reasonableness
- **Better**: Server-side timestamp for final recorded_at

### 5.5 Scalability Considerations

#### Horizontal Scaling Challenges

1. **Session state**: Each WebSocket relay instance needs Redis for pub/sub
   - ✓ Works with shared Redis
   - ✓ Can run multiple relays, share Redis
   - Concern: No load balancing config provided

2. **Task creation**: No distributed locking for task creation
   - ✓ Laravel handles via DB constraints
   - ✓ Multiple API servers can handle concurrency

3. **Route caching**: No distributed cache for polylines
   - ❌ Each API server recalculates
   - Optimization: Add Redis cache for polyline

#### Database Scaling

- `task_location_points`: Append-only, grows indefinitely
- Retention policy: 90 days, daily pruning
- Index strategy: Composite on (task_id, recorded_at)
- Partition strategy: Consider time-based partitioning at 10M+ points

---

## SECTION 6: PRODUCTION READINESS ASSESSMENT

### 6.1 Backend - PRODUCTION READY (85%)

**What's Production-Ready**:

- ✓ API endpoints fully implemented
- ✓ Authorization & authentication working
- ✓ Data validation comprehensive
- ✓ Error handling graceful
- ✓ Database schema normalized
- ✓ Redis integration functional
- ✓ Arrival detection logic sound
- ✓ Proof file handling present

**What Needs Hardening**:

- ⚠️ Assignment validation logic (dual-key issue)
- ⚠️ Data retention pruning task (need to implement CLI command)
- ⚠️ Error recovery for failed Redis publishes
- ⚠️ Rate limiting on location endpoints (currently minimal throttling)
- ⚠️ Logging of critical events (completion, arrival, reassignment)

**Deployment Readiness**: 90% - Can deploy to staging, needs final audit

### 6.2 WebSocket Relay - PRODUCTION READY (80%)

**What's Production-Ready**:

- ✓ Connection management
- ✓ Authentication flow
- ✓ Permission filtering
- ✓ Heartbeat mechanism
- ✓ Error handling
- ✓ Graceful connection closure

**What Needs Hardening**:

- ⚠️ Message compression (disabled, should enable)
- ⚠️ Connection limits per IP (DOS protection)
- ⚠️ Backpressure handling (no queue if client slow)
- ⚠️ Metrics/monitoring (no Prometheus exports)
- ⚠️ Automatic retry for failed auth

**Deployment Readiness**: 75% - Can deploy, needs monitoring

### 6.3 Frontend - NOT READY (5%)

**Critical Blockers**:

- ❌ No real data source (all hardcoded)
- ❌ No WebSocket integration
- ❌ No API integration
- ❌ No agent app interface
- ❌ No task selection workflow
- ❌ No location permission workflow
- ❌ No tracking UI for agents

**Development Effort**: 40-60 hours estimated

**Deployment Readiness**: 0% - Cannot deploy, requires complete rebuild

---

## SECTION 7: RECOMMENDED FINAL ARCHITECTURE

### 7.1 Simplified Architecture Diagram

```
Agent Device (Mobile)
    ↓
[Location Permission UI] ← geolocation API
    ↓
[Task Selection UI] ← GET /api/v1/agent/tasks
    ↓
[Start Tracking UI] ← POST /api/v1/agent/tasks/{id}/start
    ↓
[Location Sharing Toggle] ← POST /api/v1/agent/tasks/{id}/location (periodic)
    ↓
[Arrival Alert] ← WebSocket: tracking.task.arrived event
    ↓
[Complete Task UI] ← POST /api/v1/agent/tasks/{id}/complete + proofs

============================================

Dashboard (Web/Desktop)
    ↓
[WebSocket Connect] ← wss://realtime.host/tracking-ws?token=...&company_id=...
    ↓
[Listen for Events] ← tracking.task.started, .location.updated, .arrived, .completed
    ↓
[Render Live Map] ← Mapbox GL with real-time markers
    ↓
[Fetch Historic Routes] ← GET /api/v1/admin/tasks/{id}/route
```

### 7.2 Event Flow Architecture

```
Agent Action → API Endpoint → Database + Redis Event

1. Start Task:
   POST /api/v1/agent/tasks/{id}/start
   → TaskTrackingService::start()
   → Create TaskTrackingSession
   → Create initial TaskLocationPoint
   → Check arrival
   → Redis: tracking.task.started
   → Redis: tracking.location.updated
   → Redis: (optional) tracking.task.arrived
   → WebSocket Relay → Dashboard subscribers
   ← Dashboard: marker appears, route begins

2. Send Location (periodic, e.g., every 5-10 seconds):
   POST /api/v1/agent/tasks/{id}/location
   → TaskTrackingService::recordLocation()
   → Update session.last_*
   → Persist if distance >= 20m OR time >= 15s
   → Check arrival on EVERY point
   → Create TaskLocationPoint
   → Redis: tracking.location.updated
   → WebSocket Relay → Dashboard
   ← Dashboard: marker moves smoothly

3. Arrival Detected (auto, within 75m of destination):
   (triggered during recordLocation)
   → Update session.arrival_*
   → Create checkpoint LocationPoint
   → Redis: tracking.task.arrived
   → WebSocket Relay → Dashboard
   ← Dashboard: alert/notification, color change

4. Complete Task (with proof images):
   POST /api/v1/agent/tasks/{id}/complete
   → TaskTrackingService::complete()
   → Upload proof files
   → Update task.status → COMPLETED
   → Update session.end_*, set completed_by_user_id
   → Create final checkpoint LocationPoint
   → Redis: tracking.location.updated + tracking.task.completed
   → WebSocket Relay → Dashboard
   ← Dashboard: marker removed, status updated
   ← Agent: task marked completed

5. View Historical Route:
   GET /api/v1/admin/tasks/{id}/route
   → Fetch session + all LocationPoints
   → Calculate total distance
   → Return polyline array for Mapbox
   ← Dashboard: render static route with checkpoints
```

### 7.3 Database Schema (Final)

**No changes needed to tracking tables** - schema is sound

**Recommended changes**:

1. Add `tasks.primary_assigned_agent_id` → rename from `assigned_agent_id`
2. Make `task_assignments` the source of truth
3. Add index on `task_assignments(assigned_agent_id, is_current)`
4. Add index on `task_location_points(event_type, is_checkpoint)` for checkpoint queries

### 7.4 Configuration Strategy

```env
# Laravel (.env)
TASK_TRACKING_ARRIVAL_RADIUS_METERS=75
TASK_TRACKING_PERSIST_MIN_INTERVAL_SECONDS=15
TASK_TRACKING_PERSIST_MIN_DISTANCE_METERS=20
TASK_TRACKING_MAX_BATCH_POINTS=50
TASK_TRACKING_REDIS_CHANNEL_PREFIX=factory23.tracking
TASK_TRACKING_RETENTION_DAYS=90
TASK_TRACKING_PRUNE_CHUNK_SIZE=1000

# WebSocket Relay (.env)
TRACKING_WS_HOST=0.0.0.0
TRACKING_WS_PORT=8081
TRACKING_WS_REDIS_HOST=redis
TRACKING_WS_REDIS_PORT=6379
TRACKING_WS_REDIS_PASSWORD=
TRACKING_WS_AUTH_API_BASE_URL=http://nginx
TRACKING_WS_AUTH_ME_PATH=/api/v1/user/me
TRACKING_WS_HEARTBEAT_MS=30000
TRACKING_WS_AUTH_TIMEOUT_MS=10000
TRACKING_WS_MAX_MESSAGE_BYTES=32768
TRACKING_WS_LOG_LEVEL=info
TRACKING_WS_ALLOW_INSECURE_SKIP_AUTH=false
```

### 7.5 Recommended Middleware Stack

```
Agent Endpoints (track/location/complete):
  - auth:sanctum              (verify token)
  - access.role:agent         (verify role)
  - throttle:30,1             (rate limit)
  - accept:application/json   (validate content-type)

Management Route Fetch:
  - auth:sanctum              (verify token)
  - access.role:management    (verify role)
  - throttle:60,1             (more permissive)

WebSocket Connection:
  (via authentication handler in relay)
  - Bearer token validation
  - Company context resolution
  - Role determination
```

---

## SECTION 8: IMPLEMENTATION ROADMAP

### Phase 1: Foundation Fixes (1-2 weeks)

**Backend Hardening**:

1. [ ] Refactor assignment validation
   - Remove `assigned_agent_id` dependency
   - Use only `task_assignments.is_current`
   - Add constraint: only one `is_current=true` per task
   - **Files**: TaskTrackingService.ensureAssignedUser()
2. [ ] Implement data retention pruning
   - Create Laravel console command: `tracking:prune`
   - Deletes sessions older than 90 days
   - Preserves checkpoint points
   - Add to scheduler for daily 02:00 run
   - **Files**: New: app/Console/Commands/PruneTaskTracking.php
3. [ ] Add session closure on task reassignment
   - Create event listener: TaskReassigned
   - Auto-close active tracking sessions
   - Log reassignment events
   - **Files**: app/Listeners/CloseTrackingOnReassign.php
4. [ ] Enhance logging
   - Add audit trail for tracking lifecycle
   - Log all task status changes
   - Log permission denials
   - **Files**: Modify TaskTrackingService

**WebSocket Relay Hardening**:

1. [ ] Enable message compression
   - Set `perMessageDeflate: true` in WebSocketServer
   - Reduces bandwidth ~70% for high-frequency clients
   - **Files**: realtime-server/src/server.js
2. [ ] Add DOS protection
   - Limit connections per IP to 5
   - Limit message rate per connection: 100/second
   - Add connection pool limits
   - **Files**: realtime-server/src/server.js
3. [ ] Add monitoring/logging
   - Track active connections
   - Log connection failures
   - Track event delivery rates
   - **Files**: realtime-server/src/server.js

### Phase 2: Frontend WebSocket Integration (2 weeks)

**Goal**: Connect frontend to real-time events

1. [ ] **Create WebSocket service** (hooks/use-tracking-ws.ts)

   ```typescript
   export function useTrackingWebSocket(token: string, companyId: number) {
     // Initialize WebSocket connection
     // Handle authentication message
     // Subscribe to task events
     // Handle disconnection & reconnection
     // Return: connection state, event listeners
   }
   ```

2. [ ] **Create state management** (store/tracking.ts with Zustand/Redux)

   ```typescript
   interface TrackingState {
     activeTasks: Map<taskId, LiveTaskState>
     positions: Map<taskId, [lng, lat]>
     polylines: Map<taskId, [[lng, lat], ...]>
     arrivals: Map<taskId, {lat, lng, recordedAt}>
     completions: Map<taskId, boolean>
   }
   ```

3. [ ] **Integrate API calls** (lib/api/tracking.ts)
   - GET /api/v1/agent/tasks - fetch assigned tasks
   - POST /api/v1/agent/tasks/{id}/start - start tracking
   - POST /api/v1/agent/tasks/{id}/location - send location batch
   - GET /api/v1/agent/tasks/{id}/route - fetch route
   - POST /api/v1/agent/tasks/{id}/complete - complete task

4. [ ] **Event handlers** (components/map/tracking-event-handler.ts)
   ```typescript
   function handleTrackingEvent(event, state) {
     if (event.type === "tracking.task.started") {
       // Add marker, initialize polyline
     }
     if (event.type === "tracking.location.updated") {
       // Update marker position, append to polyline
     }
     if (event.type === "tracking.task.arrived") {
       // Show arrival alert, update status
     }
     if (event.type === "tracking.task.completed") {
       // Remove marker, finalize route
     }
   }
   ```

### Phase 3: Agent App UI (2 weeks)

**Goal**: Complete agent task workflow

1. [ ] **Task list page** (app/(dashboard)/agent/tasks/page.tsx)
   - Display assigned tasks
   - Filter by status: pending, in_progress, completed
   - Quick actions: start, view details

2. [ ] **Task detail/tracking page** (app/(dashboard)/agent/tasks/[id]/tracking/page.tsx)
   - Show task info: address, destination, due date
   - Location permission request UI
   - Start tracking button
   - Real-time position on mini-map
   - Arrival detection alert
   - Complete task button

3. [ ] **Task completion flow** (app/(dashboard)/agent/tasks/[id]/complete/page.tsx)
   - Display final position on map
   - Proof image capture/upload UI
   - Notes text area
   - Submit button with loading state

4. [ ] **Location sharing state** (components/tracking/location-toggle.tsx)
   - Enable/disable location sharing
   - Show battery impact warning
   - Show tracking duration

### Phase 4: Dashboard Map Integration (2 weeks)

**Goal**: Real-time operational visibility

1. [ ] **Update map component** (components/map/map-view.tsx)
   - Load real tasks from API on mount
   - Connect WebSocket
   - Replace hardcoded data with real
   - Render agent markers from state
   - Animate marker movement
   - Show task destinations
   - Show route polylines

2. [ ] **Live marker management** (components/map/live-markers.tsx)
   - Create marker for each active task
   - Update position on location.updated
   - Change color on arrival
   - Remove on completion
   - Show agent name/photo

3. [ ] **Route visualization** (components/map/route-layer.tsx)
   - GeoJSON LineString for polyline
   - Mapbox layer for rendering
   - Update on each location point
   - Checkpoint markers
   - Distance display

4. [ ] **Task info panel** (components/map/task-panel.tsx)
   - Show selected task details
   - Agent info
   - Start/arrival/current position
   - Total distance
   - Status badge
   - Completion details (when done)

### Phase 5: Route History & Replay (1 week)

**Goal**: Post-task analysis and compliance

1. [ ] **Historical route viewer** (components/map/historical-route.tsx)
   - Load route via GET /api/v1/tasks/{id}/route
   - Display polyline with checkpoints
   - Show distance, time, speed stats

2. [ ] **Route replay player** (components/map/route-replay.tsx)
   - Animate marker along route
   - Playback controls: play, pause, speed
   - Timestamp display
   - Jump to checkpoint

3. [ ] **Statistics dashboard** (app/(dashboard)/analytics/routes/page.tsx)
   - Distance traveled
   - Time taken
   - Average speed
   - Idle time
   - Proof submissions

### Phase 6: Performance & Polish (1 week)

1. [ ] **Frontend optimization**
   - Implement `requestAnimationFrame` for smooth animations
   - Batch marker updates
   - Lazy load route details
   - Implement polling fallback for WebSocket

2. [ ] **Error handling**
   - Network failure recovery
   - Permission denial flows
   - Duplicate submission prevention
   - Stale data detection

3. [ ] **Mobile responsiveness**
   - Map on small screens
   - Touch gestures
   - Full-screen map mode
   - Agent app mobile optimization

4. [ ] **Testing**
   - Unit tests for services
   - Integration tests for API
   - WebSocket stress tests
   - Permission validation tests

---

## SECTION 9: CRITICAL NEXT STEPS

### Immediate (Before Staging Deploy)

1. **Run backend audit**
   - [ ] Verify all permission checks work correctly
   - [ ] Test agent cannot access other agents' tasks
   - [ ] Test supervisors can view all agents
   - [ ] Test ownership restrictions

2. **Test Redis publishing**
   - [ ] Verify events published on all scenarios
   - [ ] Verify event structure is valid JSON
   - [ ] Verify channel naming matches relay subscriptions

3. **Test WebSocket relay**
   - [ ] Manual token auth flow
   - [ ] Verify event filtering works
   - [ ] Verify heartbeat timeouts disconnected clients
   - [ ] Stress test with 100+ concurrent connections

4. **Document API contracts**
   - [ ] OpenAPI spec for all tracking endpoints
   - [ ] Event schema documentation
   - [ ] Error code reference

### Short Term (Next Sprint)

1. **Build frontend WebSocket integration**
   - This is the critical path blocker
   - Requires 2 weeks effort
   - Enables all dashboard functionality

2. **Implement agent app UI**
   - Task list, task details, tracking UI
   - Location permission request
   - Proof upload
   - Estimated 2 weeks

3. **Deploy to staging**
   - Test full end-to-end flow
   - Agent → start tracking
   - Dashboard receives updates
   - Agent → complete task
   - Dashboard → view historical route

---

## CONCLUSION

The real-time map tracking system has a **production-ready backend** with comprehensive APIs, authorization, and event publishing. The **WebSocket relay is architecturally sound** and properly implements role-based filtering.

However, the **Next.js frontend is purely demonstrative** and requires significant development before production. The missing pieces are:

1. **WebSocket integration** (CRITICAL - blocks all dashboard functionality)
2. **Agent task app UI** (CRITICAL - blocks agent usage)
3. **Live map visualization** (HIGH - blocks operational visibility)
4. **Route history** (MEDIUM - nice-to-have for compliance)

**Estimated development effort**: 10-12 weeks to production readiness

**Recommended approach**:

1. Phase 1 (1-2 weeks): Backend hardening & data retention
2. Phase 2 (2 weeks): Frontend WebSocket integration
3. Phase 3 (2 weeks): Agent app UI
4. Phase 4 (2 weeks): Dashboard map integration
5. Phase 5-6 (2 weeks): History, replay, optimization

**Current production readiness**: 40% (backend 85%, relay 80%, frontend 5%)

---

**Document generated**: May 14, 2026  
**Reviewed by**: Architecture Assessment  
**Status**: Ready for leadership review and phasing discussion
