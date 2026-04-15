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
5. User becomes active and can log in using email/password

This implementation is company-scoped and compatible with existing self-serve and enterprise onboarding flows.

## Endpoints

Public:

1. POST /api/v1/internal/login
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

## Data Model

### users (extended)

New fields used for internal onboarding:

1. onboarding_status (pending_onboarding, active)
2. internal_role (supervisor, agent)
3. assigned_zone
4. work_days (json)
5. base_salary
6. salary_currency
7. commission_enabled
8. supervisor_user_id
9. invited_by_user_id
10. phone_number
11. gender (male, female)
12. avatar
13. internal_onboarding_completed_at

### companies (extended)

1. currency_code

### internal_user_invitations

1. company_id
2. user_id
3. invited_by_user_id
4. role
5. supervisor_user_id
6. token_hash
7. expires_at
8. sent_at
9. accepted_at
10. revoked_at

## Request and Response Contracts

### 1) Create Internal User

POST /api/v1/internal-users

Request:

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

Success 201:

{
  "success": true,
  "message": "Internal user created and onboarding invitation sent.",
  "data": {
    "user": {
      "id": 55,
      "name": "Abdul Donald",
      "email": "abduldonald@factory.local",
      "internal_role": "agent",
      "onboarding_status": "pending_onboarding",
      "assigned_zone": "Lagos Mainland",
      "work_days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
      "base_salary": "150000.00",
      "salary_currency": "NGN",
      "commission_enabled": true,
      "supervisor_user_id": 14,
      "phone_number": "+2348012345678",
      "gender": "male",
      "avatar_key": "male_02",
      "is_active": false
    },
    "invite_expires_at": "2026-04-11T13:00:00+00:00"
  },
  "errors": null
}

### 2) Resend Invite

POST /api/v1/internal-users/{user}/invite

Request:

{
  "company_id": 1
}

Success 200:

{
  "success": true,
  "message": "Onboarding invitation sent successfully.",
  "data": {
    "invite_expires_at": "2026-04-11T14:00:00+00:00"
  },
  "errors": null
}

### 3) Assign Agent to Supervisor

PATCH /api/v1/internal-users/{user}/supervisor

Request:

{
  "company_id": 1,
  "supervisor_user_id": 20
}

Success 200:

{
  "success": true,
  "message": "Supervisor assigned successfully.",
  "data": {
    "user": {
      "id": 55,
      "internal_role": "agent",
      "supervisor_user_id": 20
    }
  },
  "errors": null
}

### 4) Invitation Preview

POST /api/v1/internal/onboarding/preview

Request:

{
  "invitation_id": 101,
  "token": "<64-char-token>"
}

Success 200:

{
  "success": true,
  "message": "Invitation is valid.",
  "data": {
    "user": {
      "id": 55,
      "name": "Abdul Donald",
      "email": "abduldonald@factory.local",
      "internal_role": "agent",
      "onboarding_status": "pending_onboarding",
      "phone_number": "+2348012345678",
      "gender": "male",
      "avatar_key": "male_02"
    },
    "avatar_options": {
      "male_01": "<svg...>",
      "male_02": "<svg...>"
    },
    "avatar_options_by_gender": {
      "male": {
        "male_01": "<svg...>",
        "male_02": "<svg...>"
      },
      "female": {
        "female_01": "<svg...>",
        "female_02": "<svg...>"
      }
    },
    "prefilled_data": {
      "phone_number": "+2348012345678",
      "gender": "male",
      "avatar_key": "male_02"
    },
    "selected_gender": "male",
    "selected_avatar_key": "male_02",
    "selected_avatar_svg": "<svg...>",
    "suggested_avatar_key": "male_02",
    "expires_at": "2026-04-11T13:00:00+00:00"
  },
  "errors": null
}

### 5) Complete Onboarding

POST /api/v1/internal/onboarding/complete

Request:

{
  "invitation_id": 101,
  "token": "<64-char-token>",
  "password": "StrongPass!123",
  "password_confirmation": "StrongPass!123"
}

The user may also override any pre-filled value by including `phone_number`, `gender`, and `avatar_key` in the completion payload.

Success 200:

{
  "success": true,
  "message": "Onboarding completed successfully.",
  "data": {
    "token": "1|...",
    "token_type": "Bearer",
    "user": {
      "id": 55,
      "internal_role": "agent",
      "onboarding_status": "active",
      "is_active": true
    },
    "avatar_svg": "<svg...>"
  },
  "errors": null
}

### 6) Internal Login

POST /api/v1/internal/login

Request:

{
  "email": "abduldonald@factory.local",
  "password": "StrongPass!123"
}

Success 200:

{
  "success": true,
  "message": "Login successful.",
  "data": {
    "token": "1|...",
    "token_type": "Bearer",
    "user": {
      "id": 55,
      "email": "abduldonald@factory.local",
      "internal_role": "agent",
      "onboarding_status": "active"
    }
  },
  "errors": null
}

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

## Security Design

1. Onboarding invite link is generated as a signed temporary route.
2. Invitation token is stored hashed (sha256), never plain.
3. Invitation expiry enforced with expires_at.
4. One-time use enforced via accepted_at.
5. Existing pending invitations are revoked before resend.
6. Invalid, expired, revoked, or reused invites return validation error.
7. Pre-filled onboarding data is stored on the invited user record and can be overridden by the invited user before activation.

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
7. Login for pending_onboarding or inactive user -> 401

## Scalability and Future Work

1. Company currency alignment uses company currency_code with fallback default.
2. Commission flag is persisted and ready for future payroll logic.
3. Invitation table supports auditing and analytics.
4. Subscription checks can be extended centrally in access service without endpoint contract changes.

## Test Coverage

Feature tests:

1. Supervisor can create agent and send invite
2. Supervisor can pre-fill phone, gender, and avatar data
3. Gender-only prefill auto-assigns avatar
4. Agent creation requires supervisor
5. Agent cannot create internal users
6. Invited user can preview and complete onboarding once
7. Invited user can complete onboarding with password only when pre-filled data exists
8. Invited user can override pre-filled values during completion
9. Internal login requires active onboarded user

Test file:

1. src/tests/Feature/Internal/InternalUserOnboardingTest.php

## Breaking Changes

None. This is additive and does not change existing self-serve or enterprise endpoint contracts.
