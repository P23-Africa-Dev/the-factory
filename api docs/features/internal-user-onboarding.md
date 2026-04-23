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
2. GET /api/v1/avatars?gender=male|female
3. POST /api/v1/internal/onboarding/preview
4. POST /api/v1/internal/onboarding/complete

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

Success payload includes:

1. prefilled_data with phone_number, gender, avatar_key
2. avatar_options for selected gender (array of key/url/svg)
3. avatar_options_by_gender grouped by male and female
4. selected_avatar_svg for backward compatibility
5. suggested_avatar_key resolved from profile or random assignment

### 5) List Avatars

GET /api/v1/avatars?gender=male

Success 200:

```json
{
  "success": true,
  "data": [
    "http://localhost/storage/avatar/male/avatar_1.png",
    "http://localhost/storage/avatar/male/avatar_2.png"
  ]
}
```

Validation errors:

1. Missing gender -> 422 with errors.gender
2. Invalid gender -> 422 with errors.gender

### 6) Complete Onboarding

POST /api/v1/internal/onboarding/complete

Success payload includes:

1. token and token_type
2. user (InternalUserResource)
3. avatar_url when storage-backed avatar exists
4. avatar_svg for fallback compatibility

### 7) Agent Login

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
13. if gender is provided and avatar_key is omitted, random gender avatar is auto-assigned

Complete onboarding:

1. invitation_id exists
2. token exact 64 chars and must match hashed token
3. password must be strong and confirmed
4. final merged phone_number must exist and be valid E.164
5. final merged gender must exist and be male|female
6. final merged avatar_key must belong to resolved gender catalog
7. if gender exists without avatar, system auto-assigns a random avatar for that gender
8. avatar catalog is resolved from storage/app/public/avatar/{gender} with config fallback

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
9. Expired invitations are rejected
10. Revoked invitations are rejected
11. Invalid invitation tokens are rejected
12. Resend invite revokes the previous active invitation

## Breaking Changes

1. Login endpoint changed for internal role-based access:
   - Agent login uses `/api/v1/agent/login`
   - Supervisor login uses `/api/v1/auth/login`
2. Legacy `/api/v1/internal/login` is deprecated and available only for agent backward compatibility.
