# Task Management Frontend Guide

## Feature Overview
Task APIs support management-created tasks, project-linked tasks, standalone tasks, agent self-tasks, status updates, protected proof uploads/downloads, and strict company-scoped access for field operations.

## User Flow
1. Manager creates a task — only `title` is required. All other fields are optional.
2. Manager may attach the task to an existing same-company project by sending `project_id`.
3. Manager may assign one or more agents via `assigned_agent_ids` or the legacy `assigned_agent_id` field.
4. Agents see only tasks where they are an active assignee in their task list.
5. Agents may create standalone self-tasks through the dedicated self-task endpoint. Self-tasks can optionally include a `project_id`.
6. Agents move tasks to `in_progress`, then either `completed` or `cancelled`.
7. Agents upload proof images with optional GPS metadata before completion when required.
8. Owner/Admin may download proof files through the protected proof endpoint.
9. Managers can reassign only non-terminal tasks.

## API Endpoints
Management and shared task APIs:

1. `GET /api/v1/tasks`
2. `POST /api/v1/tasks`
3. `GET /api/v1/tasks/{task}`
4. `PATCH /api/v1/tasks/{task}/assign`
5. `PATCH /api/v1/tasks/{task}/status`
6. `POST /api/v1/tasks/{task}/proofs`
7. `GET /api/v1/tasks/{task}/proofs/{proof}`

Agent-only task API:

1. `POST /api/v1/agent/tasks/self`

Auth for all endpoints:

1. `Authorization: Bearer <token>`
2. `Accept: application/json`

## Frontend Rules

1. Always send `company_id` when the user can switch tenants.
2. Treat `project_id` as optional for both management-created and agent self-tasks.
3. Render related `project`, `creator`, `assignee`, and `assigned_users` data directly from task payloads.
4. Use `assigned_users: [{id, name}]` to show all current assignees in the UI (replaces relying on `assignee` alone for multi-agent tasks).
5. Treat `file_url` as a protected API endpoint, not as a CDN/public storage URL.
6. Hide proof-download actions unless the current role is `owner` or `admin`.
7. Disable reassignment and status actions when task status is `completed` or `cancelled`.
8. For multi-agent assignment, send `assigned_agent_ids: [id1, id2, ...]` in the reassign request. Legacy `assigned_agent_id` (single integer) is still accepted.

## Request Examples

### Create Management Task

Only `title` is required. Send any subset of optional fields:

```json
{
  "company_id": 1,
  "project_id": 8,
  "title": "Visit New Distributor",
  "type": "sales_visit",
  "description": "Perform sales visit and collect onboarding requirements.",
  "assigned_agent_id": 25,
  "location": "Victoria Island",
  "address": "12 Adeola Odeku Street, Lagos",
  "latitude": 6.4281,
  "longitude": 3.4219,
  "due_date": "2026-04-10T10:00:00+00:00",
  "required_actions": ["Take storefront photos"],
  "priority": "high",
  "minimum_photos_required": 2,
  "visit_verification_required": true
}
```

Minimal valid request:

```json
{
  "company_id": 1,
  "title": "Check warehouse access"
}
```

### Reassign Task (Multi-Agent)

```json
{
  "company_id": 1,
  "assigned_agent_ids": [25, 31, 42]
}
```

Legacy single-agent form (still supported):

```json
{
  "company_id": 1,
  "assigned_agent_id": 31
}
```

### Create Agent Self-Task

```json
{
  "company_id": 1,
  "title": "Follow up route check",
  "type": "awareness",
  "description": "Self-created route check before the shift starts.",
  "location": "Apapa",
  "address": "Warehouse Road, Apapa",
  "due_date": "2026-04-10T10:00:00+00:00",
  "priority": "low"
}
```

### Update Status

```json
{
  "company_id": 1,
  "status": "cancelled"
}
```

### Upload Proof (multipart)

1. `company_id`: 1
2. `file`: image file
3. `latitude`: 6.4281
4. `longitude`: 3.4219
5. `captured_at`: 2026-04-10T10:10:00+00:00
6. `notes`: Arrival confirmed

## Response Examples

### Create Success 201

```json
{
  "success": true,
  "message": "Task created successfully.",
  "data": {
    "task": {
      "id": 101,
      "company_id": 1,
      "project_id": 8,
      "assigned_agent_id": 25,
      "title": "Visit New Distributor",
      "status": "pending",
      "project": {
        "id": 8,
        "company_id": 1,
        "name": "Retail Expansion",
        "status": "active",
        "priority": "high"
      },
      "creator": {
        "id": 9,
        "name": "Ops Supervisor",
        "email": "ops@example.com"
      },
      "assignee": {
        "id": 25,
        "name": "Agent Jane",
        "email": "agent@example.com"
      },
      "assigned_users": [
        {
          "id": 25,
          "name": "Agent Jane"
        }
      ]
    }
  },
  "errors": null
}
```

### Agent Self-Task Success 201

```json
{
  "success": true,
  "message": "Self task created successfully.",
  "data": {
    "task": {
      "id": 102,
      "company_id": 1,
      "project_id": null,
      "created_by_user_id": 25,
      "assigned_agent_id": 25,
      "status": "pending",
      "project": null,
      "creator": {
        "id": 25,
        "name": "Agent Jane",
        "email": "agent@example.com"
      },
      "assignee": {
        "id": 25,
        "name": "Agent Jane",
        "email": "agent@example.com"
      }
    }
  },
  "errors": null
}
```

### Detail Success 200

```json
{
  "success": true,
  "message": "Task fetched successfully.",
  "data": {
    "task": {
      "id": 101,
      "status": "in_progress",
      "proofs": [
        {
          "id": 55,
          "uploaded_by_user_id": 25,
          "file_url": "/api/v1/tasks/101/proofs/55?company_id=1",
          "mime_type": "image/jpeg"
        }
      ]
    }
  },
  "errors": null
}
```

### Validation Error 422

```json
{
  "success": false,
  "message": "The given data was invalid.",
  "errors": {
    "assigned_agent_id": ["Selected agent is not a member of this company."]
  }
}
```

## Error Handling

1. `401`: redirect to login.
2. `404`: show task-not-found fallback.
3. `422`: map errors to form fields or action toasts.
4. `429`: throttle retries and uploads.

## Frontend Integration Example (Axios/fetch)

```javascript
const API = '/api/v1';

function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function getTasks(params = {}) {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${API}/tasks${query ? `?${query}` : ''}`, {
    headers: authHeaders(),
  });
  return response.json();
}

export async function getTask(taskId, companyId) {
  const response = await fetch(`${API}/tasks/${taskId}?company_id=${companyId}`, {
    headers: authHeaders(),
  });
  return response.json();
}

export async function createTask(payload) {
  const response = await fetch(`${API}/tasks`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return response.json();
}

export async function createSelfTask(payload) {
  const response = await fetch(`${API}/agent/tasks/self`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return response.json();
}

export async function updateTaskStatus(taskId, payload) {
  const response = await fetch(`${API}/tasks/${taskId}/status`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return response.json();
}

export async function uploadTaskProof(taskId, formData) {
  const response = await fetch(`${API}/tasks/${taskId}/proofs`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  return response.json();
}

export async function downloadProof(fileUrl, token) {
  const response = await fetch(fileUrl, {
    headers: {
      Accept: '*/*',
      Authorization: `Bearer ${token}`,
    },
  });
  return response.blob();
}
```

## Notes & Edge Cases

1. Status transitions are restricted to `pending -> in_progress|cancelled` and `in_progress -> completed|cancelled`.
2. Completion fails if proof count or GPS proof requirements are unmet.
3. Agents can only view and update assigned tasks.
4. Self-task creation never includes `project_id`; it is always stored as `null`.
5. Management UIs may send `project_id` for project-linked tasks or omit it for standalone tasks.
6. Preserve `company_id` when required by multi-company flows.
7. `file_url` may be `null` for roles that cannot download proof files.

