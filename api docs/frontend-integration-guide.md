# Frontend Integration Guide (Role-Aware Auth + Projects + Tasks)

## Quick Start

This guide describes how frontend apps should integrate with the current API structure.

Auth entry points:

1. POST /api/v1/auth/login for admin and supervisor
2. POST /api/v1/agent/login for agent
3. POST /api/v1/internal/login only as temporary agent compatibility fallback

Core domain endpoints:

1. Projects: /api/v1/projects
2. Tasks: /api/v1/tasks
3. Agent self-task: /api/v1/agent/tasks/self

## Recommended Client Auth Model

Persist these fields after login:

1. auth_token
2. access_role
3. user_type (shared auth responses)
4. internal_role (agent/supervisor context)

Dashboard routing:

1. access_role admin or supervisor -> management dashboard
2. access_role agent -> field dashboard

## Login API Contracts

### Shared auth login

Request:

{
  "email": "supervisor@example.com",
  "password": "password123"
}

Success response includes:

1. token
2. user_type
3. access_role
4. internal_role (supervisor or null)
5. user

### Agent login

Request:

{
  "email": "agent@example.com",
  "password": "password123"
}

Success response includes:

1. token
2. access_role=agent
3. internal_role=agent
4. user

## API Client Example

```typescript
const API_BASE = '/api/v1';

function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return token
    ? { Accept: 'application/json', Authorization: `Bearer ${token}` }
    : { Accept: 'application/json' };
}

export async function loginSharedAuth(email: string, password: string) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const body = await response.json();
  if (!response.ok || !body.success) throw body;

  localStorage.setItem('auth_token', body.data.token);
  localStorage.setItem('access_role', body.data.access_role);
  localStorage.setItem('user_type', body.data.user_type ?? '');
  localStorage.setItem('internal_role', body.data.internal_role ?? '');

  return body.data;
}

export async function loginAgent(email: string, password: string) {
  const response = await fetch(`${API_BASE}/agent/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const body = await response.json();
  if (!response.ok || !body.success) throw body;

  localStorage.setItem('auth_token', body.data.token);
  localStorage.setItem('access_role', body.data.access_role);
  localStorage.setItem('internal_role', body.data.internal_role);

  return body.data;
}
```

## Task Integration Notes

Management task create:

1. Endpoint: POST /api/v1/tasks
2. Can include nullable project_id for project-linked tasks
3. Omitting project_id creates standalone task

Agent self-task create:

1. Endpoint: POST /api/v1/agent/tasks/self
2. Always standalone (project_id remains null)
3. created_by_user_id and assigned_agent_id are both the authenticated agent

Task list:

1. Endpoint: GET /api/v1/tasks
2. Managers receive company-scoped task set
3. Agents receive only assigned tasks

## Project Integration Notes

Project list:

1. GET /api/v1/projects
2. Supports filters: company_id, status, priority, type, search
3. Returns task_summary with total/completed/pending counts and percentages

Project create/update:

1. POST /api/v1/projects
2. PATCH /api/v1/projects/{project}
3. Use multipart when sending attachments[]
4. assigned_team is optional

Progress UI rendering:

1. completed_percentage -> completed bar width
2. pending_percentage -> pending bar width
3. total_tasks=0 -> both 0

## Error Handling

1. 401: token expired/invalid or login failure
2. 422: validation or role/company access issue
3. 429: throttling

Examples:

1. Shared auth 401 message differs slightly from agent login 401
2. Use the errors object for field-level UI feedback

## Frontend Guarding Strategy

1. Hide management project/task-create screens for agent role
2. Prevent supervisor/agent endpoint cross-use in login UI
3. Keep deprecated /api/v1/internal/login out of new UI flows

## Compatibility Notes

Deprecated endpoints still present:

1. /api/v1/internal/login (agent fallback)
2. /api/v1/enterprise/login

New integrations should target the current endpoints only.

## Recommended References

1. docs/features/authentication.md
2. docs/features/internal-user-onboarding.md
3. docs/features/task-management.md
4. docs/features/project-management.md
5. docs/frontend-guide/authentication.md
6. docs/frontend-guide/task-management.md
7. docs/frontend-guide/project-management.md
