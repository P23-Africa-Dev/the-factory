# Project Management API

## Overview

This feature allows management users to organize work into projects while keeping task creation compatible with existing standalone task flows.

Supported roles in company context:

1. Owner
2. Admin
3. Supervisor
4. Agent

Role behavior:

1. Owner, Admin, and Supervisor can create, list, view, and update projects.
2. Agents cannot create, list, or manage projects.
3. Tasks can optionally belong to a project through nullable `project_id`.
4. Project progress is computed dynamically from linked task statuses.

## Endpoints

Authenticated via `auth:sanctum`:

1. `GET /api/v1/projects`
2. `POST /api/v1/projects`
3. `GET /api/v1/projects/{project}`
4. `PATCH /api/v1/projects/{project}`

Related task endpoints:

1. `POST /api/v1/tasks` for management-created tasks
2. `POST /api/v1/agent/tasks/self` for standalone agent self-tasks only
3. When task creation includes assignees, assigned users receive notification emails via Resend

### Helper Endpoint: Fetch Internal Users for Project Management

`GET /api/v1/internal-users?role=supervisor&company_id=1`

Used by frontend to fetch and populate the project manager selection dropdown when creating or updating projects.

**Throttle:** 30 requests per minute

**Authentication:** Bearer token required (Sanctum)

**Query Parameters:**

1. `role` (optional, string): Filter by internal user role. Allowed values: `supervisor` or `agent`. If omitted, returns all internal users.
2. `company_id` (optional, integer|string): Filter by specific company using internal numeric ID or public FAC-style key. If omitted, uses the authenticated user's company context.

**Request Example:**

```bash
GET /api/v1/internal-users?role=supervisor HTTP/1.1
Authorization: Bearer {sanctum-token}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Internal users retrieved successfully",
  "data": [
    {
      "id": 14,
      "name": "Chukwu Okonkwo",
      "email": "chukwu@factory23.com",
      "role": "supervisor"
    },
    {
      "id": 22,
      "name": "Ada Nwabueze",
      "email": "ada@factory23.com",
      "role": "supervisor"
    }
  ],
  "errors": null
}
```

**Empty List Response (200):**

```json
{
  "success": true,
  "message": "Internal users retrieved successfully",
  "data": [],
  "errors": null
}
```

**Authorization Rules:**

1. Authenticated user must be active (`is_active = true`)
2. Authenticated user must have an active company membership (`company_users.is_active = true`)
3. Only returns users from the authenticated user's company (company isolation enforced)
4. Returned users are filtered to:
   - Active status (`is_active = true`)
   - Have an internal role assigned (`internal_role != null`)
   - If `role` filter provided, must match the specified role

**Error Responses:**

- `401 Unauthorized` - No authentication token or invalid token
- `400 Bad Request` - Invalid `role` filter (not 'supervisor' or 'agent')
- `400 Bad Request` - `company_id` does not exist
- `403 Forbidden` - User has no company context or company is inactive

**Frontend Usage:**

When creating or updating a project, the frontend should:

1. Fetch supervisors for project manager selection:
   ```bash
   GET /api/v1/internal-users?role=supervisor
   ```

2. Handle empty response (no supervisors available):
   ```javascript
   if (response.data.length === 0) {
     showError('No supervisors available in your company');
   }
   ```

3. Populate dropdown with returned users using `id` as value and `name` as display text

4. On form submission, send selected `id` as `project_manager_user_id` in the create/update project request

## Authentication and Authorization

All project endpoints require Sanctum bearer token.

Authorization is resolved from `company_users` membership:

1. `owner|admin|supervisor` can manage projects.
2. `agent` cannot access project endpoints.
3. `company_id` is required on project creation and must resolve to an active company context for the authenticated user.
4. `project_manager_user_id` is nullable; projects can be created without a designated manager.
5. If `project_manager_user_id` is provided, the user must belong to the same company and hold `owner|admin|supervisor` role.
6. `assigned_team` users must belong to the same company.
7. Cross-company manager or team assignment is rejected with validation errors.

## Data Model

### projects

1. `company_id`
2. `created_by_user_id`
3. `project_manager_user_id`
4. `name`
5. `description`
6. `type` nullable: `sales|inspection|deployment`
7. `status`: `active|planning|completed`
8. `priority` nullable: `high|medium|low`
9. `start_date`
10. `end_date` nullable
11. `duration_days` nullable, auto-calculated from dates
12. `territory_zone` nullable
13. `notes` nullable

### project_users

1. `project_id`
2. `user_id`
3. `assigned_by_user_id`
4. `role` default `team_member`

### project_files

1. `project_id`
2. `uploaded_by_user_id`
3. `disk`
4. `file_path`
5. `original_name`
6. `mime_type`
7. `size_bytes`
8. `metadata`

### tasks linkage

1. `tasks.project_id` is nullable
2. `null` means standalone task
3. Non-null means task contributes to the linked project's progress summary

## Project Progress Logic

Progress is derived dynamically from linked tasks.

Rules:

1. `completed_tasks` counts tasks where `status = completed`
2. `pending_tasks` counts tasks where `status != completed`
3. `completed_percentage = (completed_tasks / total_tasks) * 100`
4. `pending_percentage = (pending_tasks / total_tasks) * 100`
5. If `total_tasks = 0`, both percentages return `0`

## Request and Response Contracts

### 1) Create Project

`POST /api/v1/projects`

Request is multipart when sending attachments:

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
  "project_manager": 14,
  "assigned_team": [25, 31],
  "territory_zone": "Lagos Mainland",
  "notes": "Launch before weekend campaign window."
}
```

Notes:

1. `project_manager_user_id` is the canonical field.
2. `project_manager` is accepted as a backward-compatible alias and normalized server-side.

Attachment fields when multipart:

1. `attachments[]` file uploads, max 10 files

Success 201:

```json
{
  "success": true,
  "message": "Project created successfully.",
  "data": {
    "project": {
      "id": 8,
      "company_id": 1,
      "project_manager_user_id": 14,
      "name": "Product Outreach",
      "type": "sales",
      "status": "active",
      "priority": "high",
      "start_date": "2026-04-15",
      "end_date": "2026-04-17",
      "duration_days": 3,
      "territory_zone": "Lagos Mainland",
      "attachments": [
        {
          "id": 1,
          "original_name": "brief.pdf",
          "mime_type": "application/pdf"
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
  },
  "errors": null
}
```

### 2) List Projects

`GET /api/v1/projects?company_id=1&status=active&search=outreach`

Success 200:

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
  },
  "errors": null
}
```

### 3) Update Project

`PATCH /api/v1/projects/{project}`

Supports partial updates through `sometimes` validation rules.

Common update fields:

1. `name`
2. `description`
3. `type`
4. `status`
5. `priority`
6. `start_date`
7. `end_date`
8. `project_manager_user_id`
9. `assigned_team`
10. `territory_zone`
11. `attachments`
12. `notes`

## Validation Rules

Create project:

1. `company_id` required, integer, existing company ID
2. `name` required, string, min 3, max 255
2. `description` nullable, string, max 5000
3. `type` nullable, enum `sales|inspection|deployment`
4. `status` nullable, enum `active|planning|completed` (defaults to `planning` if omitted)
5. `priority` nullable, enum `high|medium|low`
6. `start_date` required, valid date
7. `end_date` nullable, valid date, must be same as or after `start_date`
8. `project_manager_user_id` nullable, existing user ID; when provided, must belong to same company with `owner|admin|supervisor` role
9. `project_manager` optional alias for `project_manager_user_id`
9. `assigned_team` nullable array, max 100
10. `assigned_team.*` distinct existing user IDs
11. `territory_zone` nullable, string, max 255
12. `attachments` nullable array, max 10 files
13. `attachments.*` file, allowed types `jpg|jpeg|png|webp|pdf|doc|docx|xls|xlsx|csv`, max 10 MB each
14. `notes` nullable, string, max 5000

Update project:

1. Same rules as create, but fields are partial and optional
2. Duration is always recalculated from the final `start_date` and `end_date`

## File Upload Handling

1. Files are stored on the `public` disk under `project-files/{project_id}`
2. Metadata stores original filename, mime type, size, and extension
3. Files are additive on update; current implementation appends new uploads rather than replacing existing files

## Query and Performance Notes

1. Project listing eagerly loads manager, assigned team, and file relationships
2. Progress data is computed with aggregate `withCount` queries to avoid N+1 task counting
3. Pagination uses simple pagination with query-string preservation

## Edge Cases

1. Agents receive authorization failure when calling project endpoints
2. `end_date < start_date` returns validation error
3. If no tasks are linked, all progress values return `0`
4. `project_manager_user_id` is optional; if provided, must be owner/admin/supervisor-level in the current company
5. `assigned_team` users outside the company are rejected
6. A task linked to another company's project is rejected at task creation time
7. A project without a manager is valid; `project_manager_user_id` returns `null` in the response