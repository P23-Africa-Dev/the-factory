# Frontend Guide: Onboarding Flow Separation

## Goal

Guarantee a clean frontend separation between:

1. Self-serve onboarding flow.
2. Enterprise and internal invitation onboarding flow.

## Self-Serve Frontend Flow

### Steps

1. User registers on /register.
2. User verifies OTP on /verify-otp.
3. Frontend stores token from verify-email response.
4. If onboarding_completed is false, route to /complete-onboarding.
5. User completes workspace form.
6. Frontend calls POST /api/v1/onboarding/workspace with bearer token.
7. Frontend stores rotated token returned by workspace API.
8. Frontend loads GET /api/v1/user/me with rotated token.
9. Frontend stores active_company.id and user profile.
10. User is redirected to /dashboard already authenticated.

### Important Rule

The /complete-onboarding route is self-serve only and must not read or require invitation query parameters.

## Internal Invitation Frontend Flow

### Steps

1. User opens invitation URL for internal onboarding.
2. Frontend reads invitation_id and token from URL.
3. Frontend calls POST /api/v1/internal/onboarding/preview.
4. Frontend submits complete form to POST /api/v1/internal/onboarding/complete.
5. Frontend stores returned token and routes according to role experience.

### Important Rule

Invitation validation belongs only to internal invitation pages and APIs.

## Enterprise Activation Frontend Flow

### Steps

1. User opens enterprise setup/activation link.
2. Frontend loads setup info and validates company context.
3. Frontend submits activation completion payload.
4. Frontend stores returned token and redirects to dashboard.

### Important Rule

Enterprise activation token logic must not be mixed into self-serve routes.

## Implemented Frontend Fixes

1. /complete-onboarding now uses self-serve workspace form and no invitation validation.
2. Added dedicated self-serve completion form bound to /onboarding/workspace API.
3. OTP modal redirect now routes based on onboarding_completed status.

## API Integration Contracts

### Self-Serve

1. POST /api/v1/auth/register
2. POST /api/v1/auth/verify-email
3. POST /api/v1/auth/resend-otp
4. POST /api/v1/onboarding/workspace
5. GET /api/v1/user/me

### Internal Invitation

1. POST /api/v1/internal/onboarding/preview
2. POST /api/v1/internal/onboarding/complete

### Enterprise Setup

1. POST /api/v1/enterprise/onboarding/verify-company-id
2. GET /api/v1/enterprise/onboarding/setup-info
3. POST /api/v1/enterprise/onboarding/complete

## Session and State Handling

1. Persist auth token after OTP verification.
2. Replace token with workspace completion token if provided.
3. Keep onboarding state in cookies and user state store synchronized.
4. Always refresh user context from /user/me after onboarding completion.

## QA Test Matrix

### Self-Serve

1. Register and receive OTP.
2. Verify OTP and route to /complete-onboarding.
3. Complete workspace form successfully.
4. Confirm redirect to /dashboard with active session.
5. Refresh dashboard and confirm session persistence.
6. Logout and login cycle still works.

### Internal Invitation

1. Open valid invitation link and preview succeeds.
2. Complete invitation onboarding succeeds.
3. Invalid or expired invitation shows invitation-specific error.
4. No self-serve route should show invitation validation errors.

### Enterprise

1. Setup info loads for valid activation link.
2. Verify company id and complete setup succeed.
3. Invalid activation token remains blocked.

## Operational Notes

1. If lint cannot run due missing dependencies in environment, validate by focused manual code path checks and API smoke tests.
2. Keep route ownership strict to avoid future flow bleeding.
