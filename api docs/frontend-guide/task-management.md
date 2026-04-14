# Task Management Frontend Guide

## Feature Overview
Task APIs support creation, assignment, status updates, and proof uploads for company field operations.

## User Flow
1. Manager creates task and assigns an agent.
2. Agent sees assigned tasks in task list.
3. Agent starts task by setting status to in_progress.
4. Agent uploads proof images (with optional GPS metadata).
5. Agent completes task when required proofs are satisfied.
6. Manager can reassign tasks if needed.

## API Endpoints
- GET /api/v1/tasks
- POST /api/v1/tasks
- GET /api/v1/tasks/{task}
- PATCH /api/v1/tasks/{task}/assign
- PATCH /api/v1/tasks/{task}/status
- POST /api/v1/tasks/{task}/proofs

Auth for all endpoints:
- Authorization: Bearer <token>
- Accept: application/json

## Request Examples
### Create Task
```json
{
  "company_id": 1,
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

### Update Status
```json
{
  "company_id": 1,
  "status": "in_progress"
}
```

### Upload Proof (multipart)
- company_id: 1
- file: image file
- latitude: 6.4281
- longitude: 3.4219
- captured_at: 2026-04-10T10:10:00+00:00
- notes: Arrival confirmed

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
      "assigned_agent_id": 25,
      "title": "Visit New Distributor",
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
    "items": [{ "id": 101, "title": "Visit New Distributor", "status": "pending" }],
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
- 401: redirect to login.
- 404: show task-not-found fallback.
- 422: map errors to form fields or action toasts.
- 429: throttle retries and uploads.

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
  const res = await fetch(`${API}/tasks${query ? `?${query}` : ''}`, {
    headers: authHeaders(),
  });
  return res.json();
}

export async function uploadTaskProof(taskId, formData) {
  const res = await fetch(`${API}/tasks/${taskId}/proofs`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  return res.json();
}
```

## Notes & Edge Cases
- Status transitions are restricted (pending -> in_progress -> completed).
- Completion may fail if proof count or GPS proof requirements are unmet.
- Agents can only view and update assigned tasks.
- Preserve company context (company_id) when required.
