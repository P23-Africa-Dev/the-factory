# Role-Aware Authentication System - Architecture Design

## System Overview

The Factory backend uses role-aware authentication with separate login entry points and strict endpoint gating.

Current login model:

1. Shared endpoint for Admin and Supervisor: POST /api/v1/auth/login
2. Dedicated endpoint for Agent: POST /api/v1/agent/login
3. Deprecated backward-compatibility alias: POST /api/v1/internal/login (agent only)

This design keeps role boundaries clear while preserving migration compatibility.

## Core Principles

1. Role-based endpoint separation
2. Single user identity model (`users` table)
3. Generic failure responses for security
4. Sanctum token-based stateless auth
5. Company-scoped authorization for domain actions

## User Role Matrix

| User category | internal_role | onboarding requirement | Login endpoint | Response role fields |
|---|---|---|---|---|
| Self-serve admin | null | onboarding_completed_at set | /api/v1/auth/login | user_type=self-serve, access_role=admin |
| Enterprise admin | null | enterprise_onboarding_completed_at set | /api/v1/auth/login | user_type=enterprise, access_role=admin |
| Supervisor | supervisor | onboarding_status=active | /api/v1/auth/login | user_type=supervisor, access_role=supervisor, internal_role=supervisor |
| Agent | agent | onboarding_status=active | /api/v1/agent/login | access_role=agent, internal_role=agent |

## Service Layer Responsibilities

### AdminAuthService

Purpose: authenticate users allowed on shared auth endpoint.

Validation gates:

1. User exists
2. is_active = true
3. One of:
   - supervisor with onboarding_status=active
   - admin-level user (internal_role null) with completed self-serve or enterprise onboarding
4. Password verification

Returns:

1. token
2. user_type (self-serve|enterprise|supervisor)
3. access_role (admin|supervisor)
4. internal_role (supervisor|null)

### AgentAuthService

Purpose: authenticate only agent users.

Validation gates:

1. User exists
2. is_active = true
3. internal_role = agent
4. onboarding_status = active
5. Password verification

Returns:

1. token
2. access_role = agent
3. internal_role = agent

### InternalAuthService (Deprecated Path)

Purpose: preserve legacy internal login compatibility for agent clients only.

Behavior:

1. Agent-only acceptance
2. Same credential/onboarding checks as agent login
3. Marked deprecated for migration to /api/v1/agent/login

## Request Validation

### Shared auth and agent login payload

1. email: required, valid email:rfc, max 255
2. password: required, string, min 8, max 255

## Error Strategy

Shared endpoint 401 example:

- message: Invalid credentials or account not activated.
- errors.email[0]: Credentials are invalid, role is not permitted for this endpoint, or onboarding is not complete.

Agent endpoint 401 example:

- message: Invalid credentials or onboarding not completed.
- errors.email[0]: Credentials are invalid or onboarding is not complete.

Security goal:

1. Avoid account state leakage
2. Avoid user enumeration

## Token Model

1. Sanctum personal access tokens
2. 30-day explicit expiry from service layer
3. abilities = ["*"]
4. Bearer token required for protected routes

## Integration with Domain Authorization

Authentication determines identity and access role metadata.
Authorization for domain resources is company-scoped through company_users role context.

Examples:

1. Projects: owner/admin/supervisor only
2. Management task creation/assignment: owner/admin/supervisor
3. Agent task actions: assigned agent only

## Backward Compatibility and Migration

Supported now:

1. /api/v1/auth/login (current)
2. /api/v1/agent/login (current)
3. /api/v1/internal/login (deprecated alias for agents)
4. /api/v1/enterprise/login (deprecated)

Frontend migration target:

1. Use /api/v1/auth/login for admin + supervisor
2. Use /api/v1/agent/login for agent
3. Treat /api/v1/internal/login as temporary fallback only

## Testing Expectations

Minimum coverage areas:

1. Admin login success on shared endpoint
2. Supervisor login success on shared endpoint
3. Agent login success on dedicated endpoint
4. Agent denied on shared endpoint
5. Supervisor denied on agent endpoint
6. Deprecated internal alias accepts agent and rejects supervisor
7. Invalid credentials and onboarding state failures
8. Validation failures (422) and throttling behavior (429)

## Related Documentation

1. docs/features/authentication.md
2. docs/features/internal-user-onboarding.md
3. docs/features/task-management.md
4. docs/features/project-management.md
5. docs/frontend-guide/authentication.md
