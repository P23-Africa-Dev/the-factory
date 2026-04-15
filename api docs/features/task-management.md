# Task Management API

## Overview

This feature powers field task operations for company teams and supports both standalone tasks and project-linked tasks.

Supported roles in company context:

1. Owner
2. Admin
3. Supervisor
4. Agent

Role behavior in current implementation:

1. Admin, Owner, and Supervisor can create tasks for agents and optionally attach them to projects.
2. Agents can view only assigned tasks, upload proof, update status through valid lifecycle transitions, and create standalone self-tasks for themselves only.
3. Tasks may exist independently or belong to a project through nullable `project_id`.

## Endpoints

Authenticated via `auth:sanctum`:

1. `GET /api/v1/tasks`
2. `POST /api/v1/tasks`
3. `GET /api/v1/tasks/{task}`
4. `PATCH /api/v1/tasks/{task}/assign`
5. `PATCH /api/v1/tasks/{task}/status`
6. `POST /api/v1/tasks/{task}/proofs`
7. `POST /api/v1/agent/tasks/self`

## Authentication

All endpoints require Sanctum bearer token.

Headers:

1. `Accept: application/json`
2. `Authorization: Bearer <token>`

## Authorization Rules

Company role is resolved from `company_users` membership.

1. Owner, Admin, Supervisor:
   - Can create tasks through `POST /api/v1/tasks`
   - Can reassign tasks
   - Can list all tasks in the active company context
   - Can attach tasks to an existing company project via `project_id`

2. Agent:
   - Can list only tasks where `assigned_agent_id = current user`
   - Can upload proof for assigned tasks only
   - Can update status for assigned tasks only
   - Can create self-tasks only through `POST /api/v1/agent/tasks/self`
   - Cannot create projects or management tasks

3. Company context:
   - `company_id` may be provided explicitly
   - If omitted, latest company membership context is used
   - Company must be active

## Data Model

### tasks

Core task data:

1. `project_id` nullable foreign key to projects
2. `title`
3. `type`
4. `description`
5. `assigned_agent_id`
6. `location_text`
7. `address_full`
8. `latitude`, `longitude`
9. `due_at`
10. `required_actions` (json)
11. `priority`
12. `minimum_photos_required`
13. `visit_verification_required`
14. `status`
15. `started_at`
16. `completed_at`

Tenant and audit fields:

1. `company_id`
2. `created_by_user_id`
3. `last_status_updated_by_user_id`

### task_assignments

Assignment history and traceability:

1. `task_id`
2. `assigned_by_user_id`
3. `assigned_agent_id`
4. `assigned_at`
5. `unassigned_at`
6. `is_current`

### task_proofs

Proof uploads and verification metadata:

1. `task_id`
2. `uploaded_by_user_id`
3. `disk`
4. `file_path`
5. `mime_type`
6. `size_bytes`
7. `latitude`, `longitude`
8. `captured_at`
9. `notes`
10. `metadata`

## Lifecycle Rules

Allowed transitions:

1. `pending -> in_progress`
2. `in_progress -> completed`

Disallowed:

1. `completed -> any other status`
2. `pending -> completed` directly

Completion constraints:

1. Proof count must be at least `minimum_photos_required`
2. If `visit_verification_required` is true, at least one proof must include latitude and longitude

## Request and Response Contracts

### 1) Create Management Task

`POST /api/v1/tasks`

Request:

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
  "required_actions": [
    "Take storefront photos",
    "Capture competitor pricing"
  ],
  "priority": "high",
  "minimum_photos_required": 2,
  "visit_verification_required": true
}
```

Success 201:

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
      "type": "sales_visit",
      "status": "pending"
    }
  },
  "errors": null
}
```

### 2) Create Agent Self-Task

`POST /api/v1/agent/tasks/self`

Request:

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

Success 201:

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
      "title": "Follow up route check",
      "status": "pending"
    }
  },
  "errors": null
}
```

### 3) List Tasks

`GET /api/v1/tasks?company_id=1&status=pending`

Success 200:

```json
{
  "success": true,
  "message": "Tasks fetched successfully.",
  "data": {
    "items": [
      {
        "id": 101,
        "project_id": 8,
        "title": "Visit New Distributor",
        "status": "pending",
        "priority": "high"
      }
    ],
    "pagination": {
      "next_page_url": null,
      "prev_page_url": null,
      "per_page": 20
    }
  },
  "errors": null
}
```

### 4) Reassign Task

`PATCH /api/v1/tasks/101/assign`

Request:

```json
{
  "company_id": 1,
  "assigned_agent_id": 31
}
```

### 5) Update Task Status

`PATCH /api/v1/tasks/101/status`

Request:

```json
{
  "company_id": 1,
  "status": "in_progress"
}
```

Validation failure 422 example:

```json
{
  "success": false,
  "message": "The given data was invalid.",
  "data": null,
  "errors": {
    "status": [
      "Minimum 2 proof image(s) required before completion."
    ]
  }
}
```

### 6) Upload Task Proof

`POST /api/v1/tasks/101/proofs`

Multipart form fields:

1. `company_id`
2. `file`
3. `latitude`
4. `longitude`
5. `captured_at`
6. `notes`

## Validation Rules

Create management task:

1. `project_id` nullable, exists in `projects`
2. `title` required, string, min 3, max 255
3. `type` required, enum `sales_visit|inspection|delivery|collection|awareness`
4. `description` required, string, min 10, max 5000
5. `assigned_agent_id` required, exists in `users`
6. `location` required, string, min 2, max 255
7. `address` required, string, min 5, max 1000
8. `latitude` nullable, numeric, between -90 and 90
9. `longitude` nullable, numeric, between -180 and 180
10. `due_date` required, date, after now
11. `required_actions` nullable array, max 20 entries
12. `priority` required, enum `high|medium|low`
13. `minimum_photos_required` nullable integer, 0 to 20
14. `visit_verification_required` nullable boolean

Create self-task:

1. Same validation as management task except no `assigned_agent_id` or `project_id`
2. `project_id` is always stored as `null`
3. `created_by_user_id` and `assigned_agent_id` are both set to the authenticated agent

Upload proof:

1. `file` required, image, `jpg|jpeg|png|webp`, max 10 MB
2. Latitude and longitude remain optional unless task completion later requires GPS verification

## Status Codes

1. `200` Success
2. `201` Resource created
3. `401` Unauthenticated
4. `404` Task not found
5. `422` Validation, authorization, or company-context failure
6. `429` Rate limit exceeded

## Edge Cases

1. Agent cannot use `POST /api/v1/tasks`
2. Agent self-task creation cannot attach a project
3. `project_id` must belong to the active company context
4. Agents cannot view, update, or upload proof on tasks assigned to another agent
5. Completed tasks cannot change status again
3. 401: Unauthenticated
4. 404: Task not found
5. 422: Validation or authorization context failure
6. 429: Rate limit exceeded

## Scalability Notes

1. Task listing uses pagination and indexed filters.
2. Assignment history is append-only via task_assignments and safe for auditing.
3. Proofs are metadata-driven and ready for cloud disk migration.
4. Service layer isolates business rules for future eventing and notifications.
5. Access context is centralized, so subscription checks can be added in one place.

## Subscription Integration Readiness

Current state:

1. Company status must be active to access task module.

Future extension point:

1. Add plan and feature checks in TaskAccessService resolve method.
2. Keep endpoint contracts unchanged while enforcing self-serve subscription and enterprise offline-active defaults.

## Test Coverage

Implemented tests:

1. Admin can create and assign task.
2. Agent cannot create task.
3. Agent sees only assigned tasks.
4. Agent can upload proof and complete task through valid lifecycle.
5. Completion is blocked when required proof count is not met.
6. Supervisor can reassign task.

Test file:

1. src/tests/Feature/Task/TaskManagementTest.php

## Breaking Changes

None for existing endpoints. This is additive API functionality.
