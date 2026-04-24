# Task Management API

## Overview

This feature powers company-scoped field task operations and supports both standalone tasks and project-linked tasks.

Supported roles in company context:

1. Owner
2. Admin
3. Supervisor
4. Agent

Current enforced behavior:

1. Owner, Admin, and Supervisor can create tasks for agents and optionally attach them to same-company projects. Only `title` is required — all other fields are optional.
2. Agents can list only tasks assigned to them (including tasks assigned via multi-agent assignment), upload proof for assigned tasks, move assigned tasks through the allowed lifecycle, and create standalone self-tasks for themselves only.
3. Tasks always belong to a resolved active company context and must keep creator, assignee, and project aligned to that same tenant.
4. Tasks may be unassigned (no `assigned_agent_id`) and may be standalone (no `project_id`).
5. Multiple agents can be assigned to a single task via `assigned_agent_ids` array. All task responses include `assigned_users: [{id, name}]` reflecting current active assignments.

## Endpoints

Authenticated via `auth:sanctum`:

1. `GET /api/v1/tasks`
2. `POST /api/v1/tasks`
3. `GET /api/v1/tasks/{task}`
4. `PATCH /api/v1/tasks/{task}/assign`
5. `PATCH /api/v1/tasks/{task}/status`
6. `POST /api/v1/tasks/{task}/proofs`
7. `GET /api/v1/tasks/{task}/proofs/{proof}`
8. `POST /api/v1/agent/tasks/self`

## Authentication

All endpoints require Sanctum bearer token.

Headers:

1. `Accept: application/json`
2. `Authorization: Bearer <token>`

## Authorization Rules

Company role is resolved from `company_users` membership.

1. Owner, Admin, Supervisor:
   - Can create tasks through `POST /api/v1/tasks`
   - Can reassign non-terminal tasks
   - Can list all valid tasks in the active company context
   - Can attach tasks to an existing same-company project via `project_id`

2. Agent:
   - Can list only tasks where `assigned_agent_id = current user`
   - Can upload proof for assigned tasks only
   - Can update status for assigned tasks only
   - Can create self-tasks only through `POST /api/v1/agent/tasks/self`
   - Cannot create management tasks or assign tasks to other users

3. Proof access:
   - Proof metadata is returned on task detail responses
   - `file_url` is a protected API download URL, not a public storage URL
   - Only Owner and Admin can download proof files through `GET /api/v1/tasks/{task}/proofs/{proof}`

4. Company context:
   - `company_id` may be provided explicitly
   - If omitted, latest active company membership context is used
   - Company must be active
   - Task creator, task assignee, and project must all belong to the same company as the task

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

> **Note:** `disk` and `file_path` remain internal storage fields. Proofs are stored on the private local disk and the API only exposes protected `file_url` download links for authorized users.

## Lifecycle Rules

Allowed transitions:

1. `pending -> in_progress`
2. `pending -> cancelled`
3. `in_progress -> completed`
4. `in_progress -> cancelled`

Terminal states:

1. `completed`
2. `cancelled`

Disallowed:

1. `completed -> any other status`
2. `cancelled -> any other status`
3. `pending -> completed` directly

Completion constraints:

1. Proof count must be at least `minimum_photos_required`
2. If `visit_verification_required` is true, at least one proof must include latitude and longitude

## Request and Response Contracts

### 1) Create Management Task

`POST /api/v1/tasks`

Request (only `title` is required; all other fields are optional):

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

Minimal valid request:

```json
{
  "company_id": 1,
  "title": "Follow up on client site"
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

### 2) Create Agent Self-Task

`POST /api/v1/agent/tasks/self`

Request (only `title` is required):

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
        "priority": "high",
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

Supports single-agent (legacy) or multi-agent assignment.

Single-agent request (backward-compatible):

```json
{
  "company_id": 1,
  "assigned_agent_id": 31
}
```

Multi-agent request:

```json
{
  "company_id": 1,
  "assigned_agent_ids": [31, 42, 55]
}
```

Notes:

1. When `assigned_agent_id` is provided (single integer), it is normalized server-side into `assigned_agent_ids: [id]`.
2. `assigned_agent_ids` accepts 1 to 20 agent user IDs.
3. All provided agents must belong to the same active company with `agent` role.
4. The first ID in the array becomes the primary `assigned_agent_id` on the task record.
5. All assigned agents appear in the `assigned_users` array in subsequent task responses.

Failure 422 example:

```json
{
  "success": false,
  "message": "The given data was invalid.",
  "data": null,
  "errors": {
    "assigned_agent_id": [
      "Selected agent is not a member of this company."
    ]
  }
}
```

### 5) Update Task Status

`PATCH /api/v1/tasks/101/status`

Request:

```json
{
  "company_id": 1,
  "status": "cancelled"
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

### 7) Download Task Proof

`GET /api/v1/tasks/101/proofs/55?company_id=1`

Behavior:

1. Returns the stored file stream for Owner/Admin in the same company context
2. Returns `422` for Supervisor, Agent, or invalid company context

## Validation Rules

Create management task:

1. `title` required, string, min 3, max 255
2. `project_id` nullable, exists in `projects`, must belong to the same active company
3. `type` nullable, enum `sales_visit|inspection|delivery|collection|awareness`
4. `description` nullable, string, min 10, max 5000
5. `assigned_agent_id` nullable, exists in `users`, must belong to the active company with `agent` role
6. `assigned_agent_ids` nullable array of integers, min 1, max 20 entries (alternative to `assigned_agent_id`)
7. `location` nullable, string, min 2, max 255
8. `address` nullable, string, min 5, max 1000
9. `latitude` nullable, numeric, between -90 and 90
10. `longitude` nullable, numeric, between -180 and 180
11. `due_date` nullable, date, after now
12. `required_actions` nullable array, max 20 entries
13. `priority` nullable, enum `high|medium|low` (defaults to `medium` if omitted)
14. `minimum_photos_required` nullable integer, 0 to 20
15. `visit_verification_required` nullable boolean

Create self-task:

1. `title` required, string, min 3, max 255
2. `project_id` nullable, exists in `projects`, must belong to the same active company
3. `type` nullable, enum `sales_visit|inspection|delivery|collection|awareness`
4. `description` nullable, string, min 10, max 5000
5. `location` nullable, string, min 2, max 255
6. `address` nullable, string, min 5, max 1000
7. `due_date` nullable, date, after now
8. `priority` nullable, enum `high|medium|low`
9. `created_by_user_id` and `assigned_agent_id` are both set to the authenticated agent
10. No `assigned_agent_id` input is accepted (agent always self-assigned)

Upload proof:

1. `file` required, image, `jpg|jpeg|png|webp`, max 10 MB
2. Latitude and longitude remain optional unless task completion later requires GPS verification
3. Proof upload is blocked for `completed` and `cancelled` tasks

## Status Codes

1. `200` Success
2. `201` Resource created
3. `401` Unauthenticated
4. `404` Task not found
5. `422` Validation, authorization, or company-context failure
6. `429` Rate limit exceeded

## Edge Cases

1. Agent cannot use `POST /api/v1/tasks`
2. `project_id` must belong to the active company context (applies to both management tasks and self-tasks)
3. Cross-company assignment is rejected
4. Agents cannot view, update, or upload proof on tasks they are not assigned to
5. `completed` and `cancelled` tasks cannot change status again
6. Terminal tasks cannot be reassigned
7. Proof download is denied for non-owner/admin roles
8. Tasks may be created with no assignee; unassigned tasks are still valid
9. Tasks may be created with no project; standalone tasks are not required to belong to a project

## Scalability Notes

1. Task listing uses pagination and indexed filters.
2. Assignment history is append-only via `task_assignments` and safe for auditing.
3. Task listing excludes broken tenant records where creator, assignee, or project no longer match the task company.
4. Proofs are stored privately and served through authenticated endpoints, which is ready for later S3/private-CDN migration.
5. Service layer isolates business rules for future eventing and notifications.
6. Access context is centralized, so subscription checks can be added in one place.

## Subscription Integration Readiness

Current state:

1. Company status must be active to access task module.

Future extension point:

1. Add plan and feature checks in `TaskAccessService::resolve()`.
2. Keep endpoint contracts unchanged while enforcing self-serve subscription and enterprise offline-active defaults.

## Test Coverage

Implemented tests:

1. Admin can create and assign task.
2. Supervisor can create a project-linked task.
3. Agent cannot create management task.
4. Agent sees only assigned tasks.
5. Agent can upload proof and complete task through valid lifecycle.
6. Agent can create a standalone self-task.
7. Agent cannot complete task when required proof count is not met.
8. Agent can cancel only from allowed states.
9. Supervisor can reassign task.
10. Cross-company assignment is rejected.
11. Proof download is restricted to owner/admin.

Test file:

1. `src/tests/Feature/Task/TaskManagementTest.php`

## Breaking Changes

1. `file_url` now points to a protected API download endpoint and may be `null` for unauthorized roles.
2. Task status now supports `cancelled` as an additional terminal state.
