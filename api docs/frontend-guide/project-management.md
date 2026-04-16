# Project Management Frontend Guide

## Feature Overview

Projects provide the management dashboard with grouped work, project-level progress, and file-backed planning data while keeping tasks backward-compatible as standalone items.

Use this module for Admin and Supervisor experiences only.

## User Flow

1. Manager opens the projects dashboard.
2. Frontend fetches project cards from `GET /api/v1/projects`.
3. User can search or filter by status, priority, or type.
4. Project creation form submits project metadata, team, and optional attachments.
5. Tasks can later be created under a project by sending `project_id` to the task creation endpoint.
6. UI renders progress bars using `task_summary.completed_percentage` and `task_summary.pending_percentage`.

## API Endpoints

Project APIs:

1. `GET /api/v1/projects`
2. `POST /api/v1/projects`
3. `GET /api/v1/projects/{project}`
4. `PATCH /api/v1/projects/{project}`

Related task APIs:

1. `POST /api/v1/tasks` to create a task under a project or as standalone
2. `POST /api/v1/agent/tasks/self` for standalone agent self-tasks only

Authentication:

1. `Authorization: Bearer <token>`
2. `Accept: application/json`

## Request Examples

### Create Project

Use multipart form data when uploading attachments.

JSON shape:

```json
{
  "company_id": 1,
  "name": "Product Outreach",
  "description": "Physical outreach and executive networking campaign.",
  "type": "sales",
  "status": "active",
  "priority": "high",
  "start_date": "2026-04-15",
  "end_date": "2026-04-17",
  "project_manager_user_id": 14,
  "assigned_team": [25, 31],
  "territory_zone": "Lagos Mainland",
  "notes": "Launch before weekend campaign window."
}
```

Multipart file fields:

1. `attachments[]`

### Create Task Under Project

```json
{
  "company_id": 1,
  "project_id": 8,
  "title": "Deploy kiosk setup",
  "type": "delivery",
  "description": "Deploy kiosk setup and verify readiness.",
  "assigned_agent_id": 25,
  "location": "Ikeja City Mall",
  "address": "Obafemi Awolowo Way, Ikeja",
  "due_date": "2026-04-16T10:00:00+00:00",
  "priority": "high"
}
```

## Response Examples

### Project List Success

```json
{
  "success": true,
  "message": "Projects fetched successfully.",
  "data": {
    "items": [
      {
        "id": 8,
        "name": "Product Outreach",
        "status": "active",
        "priority": "high",
        "duration_days": 3,
        "task_summary": {
          "total_tasks": 3,
          "completed_tasks": 1,
          "pending_tasks": 2,
          "completed_percentage": 33.33,
          "pending_percentage": 66.67
        }
      }
    ],
    "pagination": {
      "next_page_url": null,
      "prev_page_url": null,
      "per_page": 20
    }
  }
}
```

### Create Project Success

```json
{
  "success": true,
  "message": "Project created successfully.",
  "data": {
    "project": {
      "id": 8,
      "name": "Product Outreach",
      "duration_days": 3,
      "attachments": [
        {
          "id": 1,
          "original_name": "brief.pdf"
        }
      ],
      "task_summary": {
        "total_tasks": 0,
        "completed_tasks": 0,
        "pending_tasks": 0,
        "completed_percentage": 0,
        "pending_percentage": 0
      }
    }
  }
}
```

## Frontend Integration Example (fetch)

```javascript
const API_BASE = '/api/v1';

function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function getProjects(params = {}) {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${API_BASE}/projects${query ? `?${query}` : ''}`, {
    headers: authHeaders(),
  });
  return response.json();
}

export async function createProject(payload, files = []) {
  const formData = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => formData.append(`${key}[]`, String(item)));
      return;
    }

    if (value !== null && value !== undefined) {
      formData.append(key, String(value));
    }
  });

  files.forEach((file) => formData.append('attachments[]', file));

  const response = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });

  return response.json();
}

export async function updateProject(projectId, payload, files = []) {
  const formData = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => formData.append(`${key}[]`, String(item)));
      return;
    }

    if (value !== null && value !== undefined) {
      formData.append(key, String(value));
    }
  });

  files.forEach((file) => formData.append('attachments[]', file));

  const response = await fetch(`${API_BASE}/projects/${projectId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: formData,
  });

  return response.json();
}
```

## UI Integration Notes

1. The project list card can map directly to `name`, `description`, `status`, `priority`, and `task_summary`.
2. Render the completed progress bar from `task_summary.completed_percentage`.
3. Render the pending progress bar from `task_summary.pending_percentage`.
4. Show `0%` when `task_summary.total_tasks` is `0`.
5. Use `duration_days` for lightweight timeline labels where needed.

## Error Handling

1. `401`: token expired or missing, redirect to login.
2. `422`: show field-level validation errors, especially for invalid dates, invalid manager, or wrong team members.
3. `422`: agents attempting to access project APIs should be blocked by UI routing and still handled gracefully if the API rejects them.
4. `429`: throttle repeated submissions or uploads.

## Notes & Edge Cases

1. Project creation and updates are management-only flows.
2. Agent self-tasks are always standalone and should not appear as project-create options in the agent UI.
3. Attachments are additive on update; uploading new files does not remove old files.
4. `assigned_team` is optional and may be empty.
5. `end_date` is optional; if omitted, `duration_days` may be `null`.