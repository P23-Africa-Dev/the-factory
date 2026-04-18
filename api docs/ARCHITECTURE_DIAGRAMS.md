# System Architecture Diagrams

## 1. High-Level Authentication Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                THE FACTORY - ROLE-AWARE AUTH (v1)              │
└──────────────────────────────────────────────────────────────────┘

                         User Attempts Login
                              │
                              ▼
                    ┌──────────────────────┐
                    │  Select Login Type   │
                    └──────────────────────┘
                         │              │
             Shared Auth (Admin/Supervisor)   Agent Login
                         │              │
         ┌───────────────┘              └───────────────┐
         │                                              │
         ▼                                              ▼
   POST /api/v1/auth/login                     POST /api/v1/agent/login
         │                                              │
         ▼                                              ▼
   AdminAuthService                              AgentAuthService
   - internal_role NULL for admin flows          - internal_role = agent
   - OR internal_role = supervisor               - onboarding_status = active
   - onboarding completed / active               - is_active = true
   - is_active = true                            - verify password
   - verify password                                      │
         │                                               │
         ├─ Valid ────────────────┐        ┌─────────────┤
         │                        │        │             │
         ▼                        ▼        ▼             ▼
   Create token              Return user_type      Create token
   Return access_role        Return internal_role   Return access_role=agent
   (admin|supervisor)        (supervisor|null)
         │
         └─ Invalid ─────────────────────────────────────────────┐
                                                                 ▼
                                                            Return 401
```

Backward compatibility:

- POST /api/v1/internal/login is deprecated and accepts agents only.

---

## 2. Role and Dashboard Routing

```
┌─────────────────────────────────────────────────────────────┐
│               LOGIN RESPONSE DRIVES UI ROUTING             │
└─────────────────────────────────────────────────────────────┘

Shared auth response:
  access_role = admin|supervisor
  user_type   = self-serve|enterprise|supervisor
      └─> Management dashboard

Agent auth response:
  access_role  = agent
  internal_role = agent
      └─> Field/agent dashboard

Deprecated alias:
  /api/v1/internal/login
  └─> Agent only (temporary compatibility)
```

---

## 3. Project and Task Domain Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   PROJECT-TASK RELATIONSHIP                │
└─────────────────────────────────────────────────────────────┘

Project (projects)
  id
  company_id
  project_manager_user_id
  status/priority/type
  start_date/end_date/duration_days
          │
          ├───────────────┐
          │ hasMany       │ belongsToMany
          ▼               ▼
      Task (tasks)     Project Team (project_users)
      project_id NULLABLE
          │
          ├─ project_id = NULL  -> standalone task
          └─ project_id != NULL -> project-linked task

Project files:
  project_files linked to project_id
```

---

## 4. API Endpoint Architecture (v1)

```
PUBLIC
├── POST /api/v1/auth/register
├── POST /api/v1/auth/verify-email
├── POST /api/v1/auth/resend-otp
├── POST /api/v1/auth/login
├── POST /api/v1/agent/login
├── POST /api/v1/internal/login            (deprecated, agent-only)
├── POST /api/v1/internal/onboarding/preview
├── POST /api/v1/internal/onboarding/complete
├── POST /api/v1/enterprise/demo-requests
├── POST /api/v1/enterprise/onboarding/verify-company-id
├── POST /api/v1/enterprise/onboarding/complete
└── POST /api/v1/enterprise/login          (deprecated)

AUTHENTICATED
├── GET   /api/v1/user/me
├── POST  /api/v1/onboarding/workspace
├── GET   /api/v1/projects
├── POST  /api/v1/projects
├── GET   /api/v1/projects/{project}
├── PATCH /api/v1/projects/{project}
├── GET   /api/v1/tasks
├── POST  /api/v1/tasks
├── GET   /api/v1/tasks/{task}
├── PATCH /api/v1/tasks/{task}/assign
├── PATCH /api/v1/tasks/{task}/status
├── POST  /api/v1/tasks/{task}/proofs
├── POST  /api/v1/agent/tasks/self
├── POST  /api/v1/internal-users
├── POST  /api/v1/internal-users/{user}/invite
└── PATCH /api/v1/internal-users/{user}/supervisor
```

---

## 5. Project Progress Computation

```
For each project:
  total_tasks      = count(tasks where project_id = project.id)
  completed_tasks  = count(tasks where project_id = project.id and status = completed)
  pending_tasks    = count(tasks where project_id = project.id and status != completed)

  completed_percentage = total_tasks > 0 ? (completed_tasks / total_tasks) * 100 : 0
  pending_percentage   = total_tasks > 0 ? (pending_tasks / total_tasks) * 100 : 0
```

---

## 6. Authorization Summary

```
Company role (company_users.role):
  owner/admin/supervisor
    - can manage projects
    - can create/assign tasks

  agent
    - cannot manage projects
    - can only see assigned tasks
    - can update assigned task status
    - can upload proof for assigned tasks
    - can create standalone self-task
```

---

## 7. Multi-Tenant Context Flow

```
Token -> user -> resolve company context from company_users pivot
      -> validate active company
      -> apply role-specific query scoping

Tasks:
  - managers query company scope
  - agents query assigned_agent_id = current_user_id

Projects:
  - managers only
  - always scoped by company_id
```

---

This document is a visual summary. For implementation details, use docs/features/authentication.md, docs/features/project-management.md, docs/features/task-management.md, and docs/features/internal-user-onboarding.md.
