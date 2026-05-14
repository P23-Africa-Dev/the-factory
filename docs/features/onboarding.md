# Onboarding Flows and Authentication Boundaries

## Purpose

This document defines the production onboarding architecture and strict separation rules between self-serve onboarding and enterprise invitation-based onboarding.

## Flow Separation Rules

### Self-Serve Onboarding

Self-serve onboarding is direct SaaS signup and must never require invitation context.

Rules:

1. No invitation token validation.
2. No invitation_id requirement.
3. No signed invitation URL requirement.
4. No dependency on internal invitation tables.
5. No enterprise activation token checks.

### Enterprise and Internal Invitation Onboarding

Enterprise setup and internal user onboarding are invitation or activation based.

Rules:

1. Invitation and activation tokens are required where applicable.
2. Invitation endpoints validate token and expiry.
3. Signed or secure setup link validation remains enforced.
4. This logic is isolated from self-serve routes.

## Backend Endpoint Ownership

### Self-Serve Endpoints

1. POST /api/v1/auth/register
2. POST /api/v1/auth/verify-email
3. POST /api/v1/auth/resend-otp
4. GET /api/v1/user/me
5. POST /api/v1/onboarding/workspace

Behavior:

1. OTP verification issues Sanctum token.
2. Workspace completion finalizes onboarding and rotates token.
3. Workspace completion provisions active company membership.

### Internal Invitation Endpoints

1. POST /api/v1/internal/onboarding/preview
2. POST /api/v1/internal/onboarding/complete

Behavior:

1. invitation_id and token required.
2. Token hash and invitation usability validated.
3. Internal onboarding completion issues internal auth token.

### Enterprise Activation Endpoints

1. POST /api/v1/enterprise/onboarding/verify-company-id
2. GET /api/v1/enterprise/onboarding/setup-info
3. POST /api/v1/enterprise/onboarding/complete

Behavior:

1. Activation token and request lifecycle validated.
2. Enterprise onboarding completion issues enterprise auth token.

## Authentication and Token Lifecycle

### After OTP Verification (Self-Serve)

1. API returns Sanctum token.
2. Frontend persists token.
3. If onboarding_completed is false, route to self-serve completion.
4. If onboarding_completed is true, route directly to dashboard.

### After Workspace Completion (Self-Serve)

1. API rotates token and returns fresh token.
2. Frontend replaces token with returned token.
3. Frontend calls GET /api/v1/user/me using fresh token.
4. Frontend stores active_company.id as canonical company context.
5. User is redirected to dashboard in authenticated state.

## Implemented Fix Summary

The self-serve onboarding route now renders a self-serve workspace form and no longer executes invitation parsing or invitation validation logic.

Frontend changes:

1. Self-serve completion screen is now invitation agnostic.
2. New self-serve workspace form submits to POST /api/v1/onboarding/workspace.
3. OTP modal redirect now respects onboarding_completed and routes to dashboard when already complete.

## Security and Stability Notes

1. Self-serve and invitation flows are isolated by endpoint ownership and route intent.
2. Invitation validation remains active only for invitation-based endpoints.
3. Session continuity is maintained by token rotation handling on workspace completion.
4. No bypasses were added to invitation validation.

## Regression Checklist

1. Self-serve OTP verify followed by complete onboarding succeeds without invitation params.
2. Self-serve users are authenticated on dashboard immediately after completion.
3. Internal invitation preview and complete endpoints still require valid invitation token.
4. Enterprise activation flow still validates company activation context.
5. Login, me, and logout still function across self-serve and enterprise users.
