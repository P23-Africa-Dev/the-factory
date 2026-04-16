# Internal User Onboarding API

## Overview

This feature enables Admin and Supervisor users to create and onboard internal workforce users.

Supported internal roles:

1. supervisor
2. agent

Flow:

1. Manager creates internal user profile (pending onboarding state)
2. Manager can optionally pre-fill phone number, gender, and avatar selection
3. System sends secure invitation email with signed and expiring onboarding link
4. Invited user reviews pre-filled values, optionally edits them, and sets password
5. User becomes active
6. Login entry points after onboarding:
   - Supervisor -> `POST /api/v1/auth/login`
   - Agent -> `POST /api/v1/agent/login`

## Endpoints

Public:

1. POST /api/v1/agent/login
2. POST /api/v1/internal/onboarding/preview
3. POST /api/v1/internal/onboarding/complete

Authenticated (auth:sanctum):

1. POST /api/v1/internal-users
2. POST /api/v1/internal-users/{user}/invite
3. PATCH /api/v1/internal-users/{user}/supervisor

Web signed route:

1. GET /onboarding/internal/{invitation}/{token}

## Authentication and Authorization

1. Internal user management endpoints require bearer token.
2. Company role context is resolved from company_users pivot.
3. Roles allowed to manage internal users:
   - owner
   - admin
   - supervisor
4. Agent users cannot create or manage internal users.

## Request and Response Contracts

### 1) Create Internal User

POST /api/v1/internal-users

Request:

```json
{
  "company_id": 1,
  "full_name": "Abdul Donald",
  "email": "abduldonald@factory.local",
  "role": "agent",
  "phone_number": "+2348012345678",
  "gender": "male",
  "avatar_key": "male_02",
  "assigned_zone": "Lagos Mainland",
  "work_days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
  "base_salary": 150000,
  "currency_code": "NGN",
  "commission_enabled": true,
  "supervisor_user_id": 14
}
```

### 2) Resend Invite

POST /api/v1/internal-users/{user}/invite

### 3) Assign Agent to Supervisor

PATCH /api/v1/internal-users/{user}/supervisor

### 4) Invitation Preview

POST /api/v1/internal/onboarding/preview

### 5) Complete Onboarding

POST /api/v1/internal/onboarding/complete

### 6) Agent Login

POST /api/v1/agent/login

Request:

```json
{
  "email": "abduldonald@factory.local",
  "password": "StrongPass!123"
}
```

Success 200:

```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "token": "1|...",
    "token_type": "Bearer",
    "internal_role": "agent",
    "access_role": "agent",
    "user": {
      "id": 55,
      "email": "abduldonald@factory.local",
      "internal_role": "agent",
      "onboarding_status": "active"
    }
  },
  "errors": null
}
```

## Validation Rules

Create user:

1. full_name required string min 2 max 255
2. email required unique
3. role required in supervisor|agent
4. assigned_zone required
5. work_days required array of weekday values
6. base_salary required numeric min 0
7. currency_code optional 3-letter ISO
8. role=agent requires supervisor_user_id
9. phone_number optional E.164 format
10. gender optional male|female
11. avatar_key optional but must match selected gender if provided
12. role=supervisor supports optional assign_agent_ids

Complete onboarding:

1. invitation_id exists
2. token exact 64 chars and must match hashed token
3. password must be strong and confirmed
4. final merged phone_number must exist and be valid E.164
5. final merged gender must exist and be male|female
6. final merged avatar_key must belong to resolved gender catalog
7. if gender exists without avatar, system auto-assigns a random avatar for that gender

## Status Codes

1. 200 Success
2. 201 Resource created
3. 401 Unauthenticated or invalid login credentials
4. 404 Resource not found
5. 422 Validation / authorization context failure
6. 429 Rate limit exceeded

## Edge Cases

1. Duplicate email on create -> 422
2. Agent without supervisor assignment -> 422
3. Supervisor assignment outside company context -> 422
4. Avatar key inconsistent with selected gender -> 422
5. Expired or reused invitation token -> 422
6. Completion with password only succeeds when pre-filled data already satisfies required profile fields
7. Agent login requires active onboarded user
8. Supervisor must use shared auth endpoint `/api/v1/auth/login`

## Breaking Changes

1. Login endpoint changed for internal role-based access:
   - Agent login uses `/api/v1/agent/login`
   - Supervisor login uses `/api/v1/auth/login`
2. Legacy `/api/v1/internal/login` is deprecated and available only for agent backward compatibility.
