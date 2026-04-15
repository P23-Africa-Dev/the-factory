# Task Management Frontend Guide

## Feature Overview
Task APIs support management-created tasks, project-linked tasks, standalone tasks, agent self-tasks, status updates, and proof uploads for company field operations.

## User Flow
1. Manager creates a task and assigns an agent.
2. Manager may attach the task to an existing project by sending `project_id`.
3. Agents see only tasks assigned to them in their task list.
4. Agents may create standalone self-tasks through the dedicated self-task endpoint.
5. Agents start tasks by setting status to `in_progress`.
6. Agents upload proof images with optional GPS metadata.
7. Agents complete tasks when required proofs are satisfied.
8. Managers can reassign tasks if needed.

## API Endpoints
Management and shared task APIs:

1. `GET /api/v1/tasks`
2. `POST /api/v1/tasks`
3. `GET /api/v1/tasks/{task}`
4. `PATCH /api/v1/tasks/{task}/assign`
5. `PATCH /api/v1/tasks/{task}/status`
6. `POST /api/v1/tasks/{task}/proofs`

Agent-only task API:

1. `POST /api/v1/agent/tasks/self`

Auth for all endpoints:

1. `Authorization: Bearer <token>`
2. `Accept: application/json`

## Request Examples

### Create Management Task

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
  "status": "in_progress"
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
      "status": "pending"
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
      "status": "pending"
    }
  },
  "errors": null
}
```

### List Success 200

```json
{
  "success": true,
  "message": "Tasks fetched successfully.",
  "data": {
    "items": [{ "id": 101, "project_id": 8, "title": "Visit New Distributor", "status": "pending" }],
    "pagination": { "next_page_url": null, "prev_page_url": null, "per_page": 20 }
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
    "status": ["Minimum 2 proof image(s) required before completion."]
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

export async function uploadTaskProof(taskId, formData) {
  const response = await fetch(`${API}/tasks/${taskId}/proofs`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  return response.json();
}
```

## Notes & Edge Cases

1. Status transitions are restricted: `pending -> in_progress -> completed`.
2. Completion may fail if proof count or GPS proof requirements are unmet.
3. Agents can only view and update assigned tasks.
4. Self-task creation never includes `project_id`; it is always stored as `null`.
5. Management UIs may send `project_id` for project-linked tasks or omit it for standalone tasks.
6. Preserve `company_id` when required by multi-company flows.

