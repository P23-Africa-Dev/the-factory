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
4. User profile: /api/v1/user/me
5. Logout: /api/v1/auth/logout
6. Avatar catalog: /api/v1/avatars?gender=male|female

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

## Logout

```typescript
export async function logout() {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: authHeaders(),
  });
  localStorage.removeItem('auth_token');
  localStorage.removeItem('access_role');
  localStorage.removeItem('user_type');
  localStorage.removeItem('internal_role');
}
```

## User Profile

```typescript
export async function fetchMe() {
  const response = await fetch(`${API_BASE}/user/me`, {
    headers: authHeaders(),
  });
  const body = await response.json();
  if (!response.ok || !body.success) throw body;
  return body.data; // UserResource object
}
```

## Internal Onboarding Avatar Integration

Avatar loading flow:

1. Fetch invitation preview from POST /api/v1/internal/onboarding/preview
2. Read prefilled_data.gender when available
3. Call GET /api/v1/avatars?gender={gender} to load storage-backed PNGs
4. Render key/url list and persist selected avatar_key
5. Submit selected avatar_key to POST /api/v1/internal/onboarding/complete

Avatar API response shape:

```json
{
  "success": true,
  "data": [
    "http://localhost/storage/avatar/female/avatar_1.png",
    "http://localhost/storage/avatar/female/avatar_2.png"
  ]
}
```

Preview response notes:

1. avatar_options returns selected-gender options as key/url/svg
2. avatar_options_by_gender returns male/female grouped options
3. selected_avatar_svg is provided for backward compatibility
4. suggested_avatar_key is safe default for first render

Completion response notes:

1. avatar_url is returned when selected avatar exists in public storage
2. avatar_svg remains available as compatibility fallback

Validation behavior:

1. avatar_key must belong to selected gender
2. invitation token must match hashed invitation token
3. expired, revoked, or previously accepted invitations return 422

## Date Format Convention

All API date-time fields use ISO 8601 format (`2025-01-15T10:30:00.000000Z`).
Date-only fields (e.g. project `start_date`, `end_date`) use `YYYY-MM-DD` format.

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
2. 403: role-based access violation
3. 422: validation or role/company access issue
4. 429: throttling

Company context notes:
1. All tenant-bound APIs resolve company context from `company_users`.
2. Shared auth and agent auth require users to have active company membership.
3. Frontend should always pass explicit `company_id` when available for deterministic context selection.

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
