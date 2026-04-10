# Task Management API

## Overview

This feature powers field task operations for company teams.

Supported roles in company context:

1. Admin
2. Supervisor
3. Agent

Role behavior in current implementation:

1. Admin and Supervisor can create and assign tasks.
2. Agent can view only assigned tasks, upload proof, and update status through valid lifecycle transitions.

This module is company-scoped and designed for future subscription enforcement without refactoring core task structures.

## Endpoints

1. GET /api/v1/tasks
2. POST /api/v1/tasks
3. GET /api/v1/tasks/{task}
4. PATCH /api/v1/tasks/{task}/assign
5. PATCH /api/v1/tasks/{task}/status
6. POST /api/v1/tasks/{task}/proofs

## Authentication

All endpoints require Sanctum bearer token.

Headers:

1. Accept: application/json
2. Authorization: Bearer <token>

## Authorization Rules

Company role is resolved from company_users membership.

1. Admin, Owner, Supervisor:
- Can create tasks
- Can reassign tasks
- Can list all tasks for selected company

2. Agent:
- Can list only tasks assigned_agent_id = current user
- Can upload proof for assigned tasks only
- Can update status for assigned tasks only

3. Company context:
- company_id can be provided explicitly
- if omitted, latest company membership context is used
- company must be active

## Data Model

### tasks

Core task data:

1. title
2. type
3. description
4. assigned_agent_id
5. location_text
6. address_full
7. latitude, longitude
8. due_at
9. required_actions (json)
10. priority
11. minimum_photos_required
12. visit_verification_required
13. status
14. started_at
15. completed_at

Tenant and audit fields:

1. company_id
2. created_by_user_id
3. last_status_updated_by_user_id

### task_assignments

Assignment history and traceability:

1. task_id
2. assigned_by_user_id
3. assigned_agent_id
4. assigned_at
5. unassigned_at
6. is_current

### task_proofs

Proof uploads and verification metadata:

1. task_id
2. uploaded_by_user_id
3. disk
4. file_path
5. mime_type
6. size_bytes
7. latitude, longitude
8. captured_at
9. notes
10. metadata

## Lifecycle Rules

Allowed transitions:

1. pending -> in_progress
2. in_progress -> completed

Disallowed:

1. completed -> any other status
2. pending -> completed directly

Completion constraints:

1. Proof count must be at least minimum_photos_required
2. If visit_verification_required is true, at least one proof must include latitude and longitude

## Request And Response Contracts

### 1) Create Task

POST /api/v1/tasks

Request:

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
  "required_actions": [
    "Take storefront photos",
    "Capture competitor pricing"
  ],
  "priority": "high",
  "minimum_photos_required": 2,
  "visit_verification_required": true
}

Success 201:

{
  "success": true,
  "message": "Task created successfully.",
  "data": {
    "task": {
      "id": 101,
      "company_id": 1,
      "assigned_agent_id": 25,
      "title": "Visit New Distributor",
      "type": "sales_visit",
      "status": "pending"
    }
  },
  "errors": null
}

### 2) List Tasks

GET /api/v1/tasks?company_id=1&status=pending

Success 200:

{
  "success": true,
  "message": "Tasks fetched successfully.",
  "data": {
    "items": [
      {
        "id": 101,
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

### 3) Reassign Task

PATCH /api/v1/tasks/101/assign

Request:

{
  "company_id": 1,
  "assigned_agent_id": 31
}

Success 200:

{
  "success": true,
  "message": "Task reassigned successfully.",
  "data": {
    "task": {
      "id": 101,
      "assigned_agent_id": 31
    }
  },
  "errors": null
}

### 4) Update Task Status

PATCH /api/v1/tasks/101/status

Request:

{
  "company_id": 1,
  "status": "in_progress"
}

Success 200:

{
  "success": true,
  "message": "Task status updated successfully.",
  "data": {
    "task": {
      "id": 101,
      "status": "in_progress"
    }
  },
  "errors": null
}

Validation failure 422 example:

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

### 5) Upload Task Proof

POST /api/v1/tasks/101/proofs

Multipart form fields:

1. company_id
2. file
3. latitude
4. longitude
5. captured_at
6. notes

Success 201:

{
  "success": true,
  "message": "Task proof uploaded successfully.",
  "data": {
    "proof": {
      "id": 501,
      "uploaded_by_user_id": 25,
      "file_url": "http://localhost/storage/task-proofs/101/abc.jpg",
      "mime_type": "image/jpeg",
      "size_bytes": 402110
    }
  },
  "errors": null
}

## Validation Rules

Create task:

1. title: required, string, min 3, max 255
2. type: required, enum sales_visit|inspection|delivery|collection|awareness
3. description: required, string, min 10, max 5000
4. assigned_agent_id: required, exists users
5. location: required, string, min 2, max 255
6. address: required, string, min 5, max 1000
7. latitude: nullable, numeric, between -90 and 90
8. longitude: nullable, numeric, between -180 and 180
9. due_date: required, date, after now
10. required_actions: nullable array, max 20 entries
11. priority: required, enum high|medium|low
12. minimum_photos_required: nullable int, 0 to 20
13. visit_verification_required: nullable boolean

Upload proof:

1. file: required, image, jpg|jpeg|png|webp, max 10MB
2. latitude and longitude optional but required indirectly when task completion enforces GPS verification

## Status Codes

1. 200: Success
2. 201: Resource created
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
