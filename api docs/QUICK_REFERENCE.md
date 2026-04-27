# API Quick Reference (Current v1)

## One-Minute Overview

Authentication entry points:

| User group | Endpoint | Role metadata in response |
|---|---|---|
| Self-serve Admin + Enterprise Admin + Supervisor | POST /api/v1/auth/login | access_role, user_type, internal_role |
| Agent | POST /api/v1/agent/login | access_role=agent, internal_role=agent |

Compatibility endpoints:

1. POST /api/v1/internal/login (deprecated, agent-only)
2. POST /api/v1/enterprise/login (deprecated)

## Endpoint Choice Guide

1. internal_role = agent -> /api/v1/agent/login
2. internal_role = supervisor -> /api/v1/auth/login
3. internal_role = null (self-serve/enterprise admin) -> /api/v1/auth/login

## Login cURL Examples

```bash
# Shared auth (admin/supervisor)
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"supervisor@example.com","password":"password123"}'

# Agent login
curl -X POST http://localhost:8080/api/v1/agent/login \
  -H "Content-Type: application/json" \
  -d '{"email":"agent@example.com","password":"password123"}'
```

## Typical Authenticated Endpoints

1. GET /api/v1/user/me
2. GET /api/v1/projects
3. POST /api/v1/projects
4. GET /api/v1/tasks
5. POST /api/v1/tasks
6. POST /api/v1/agent/tasks/self
7. GET /api/v1/payroll
8. POST /api/v1/payroll
9. PUT /api/v1/payroll/{id}

## Project and Task Quick Rules

Projects:

1. Manager roles only: owner/admin/supervisor
2. Include progress summary in project responses
3. Attachments accepted via multipart attachments[]

Tasks:

1. Management create endpoint: POST /api/v1/tasks
2. Optional project_id links task to project
3. project_id omitted/null means standalone task
4. Agent self-task endpoint: POST /api/v1/agent/tasks/self

Payroll:

1. One payroll settings record per company
2. Only admin/supervisor can create or update payroll settings
3. Agents inherit payroll settings and can fetch read-only
4. Daily pay is auto-derived as base_salary / work_days

## Project Progress Formula

1. completed_percentage = (completed_tasks / total_tasks) * 100
2. pending_percentage = (pending_tasks / total_tasks) * 100
3. If total_tasks = 0, both values are 0

## Status/Behavior Cheatsheet

| Area | Rule |
|---|---|
| Shared auth | Admin + Supervisor only |
| Agent auth | Agent only |
| Agent on shared endpoint | 401 |
| Supervisor on agent endpoint | 401 |
| Task status transitions | pending -> in_progress -> completed |
| Completed task mutation | blocked |

## Common Error Codes

1. 200 success
2. 201 created
3. 401 unauthorized/auth failure
4. 422 validation/authorization context failure
5. 429 throttled

## Troubleshooting

Login 401 on valid password:

1. confirm correct endpoint for role
2. confirm is_active=true
3. confirm onboarding completion state

Project access denied:

1. confirm user role is owner/admin/supervisor in company_users
2. confirm company_id context is valid and active

Task update denied for agent:

1. confirm task is assigned to current agent
2. confirm company context and assignment match

## Source Docs

1. docs/features/authentication.md
2. docs/features/internal-user-onboarding.md
3. docs/features/task-management.md
4. docs/features/project-management.md
5. docs/features/payroll-management.md
6. docs/frontend-guide/authentication.md
7. docs/frontend-guide/task-management.md
8. docs/frontend-guide/project-management.md
9. docs/frontend-guide/payroll-management.md

Last Updated: April 15, 2026
Status: Current
