# Company / Enterprise Onboarding Flow

## Overview

This flow supports enterprise onboarding through an admin-controlled lifecycle:

1. Book demo request submitted by prospect
2. Admin review and approval
3. Activation email with secure first-time setup link
4. First-time setup (company ID verification + password creation)
5. Subsequent logins with email/password only

This flow is separate from self-serve onboarding.

## State Machine

`pending -> approved -> activated`

- `pending`: request submitted and awaiting admin review
- `approved`: admin has approved request and activation link was issued
- `activated`: user completed first-time setup and account is active

## Data Model

### companies

- `company_id` (unique business identifier shown to users)
- `name`, `country`, `team_size`, `use_case`
- `status`, `activated_at`

### company_demo_requests

- submission payload fields:
  - `full_name`, `email`, `company_name`, `country`, `team_size`, `use_case`
- lifecycle fields:
  - `status`, `requested_at`, `reviewed_at`, `approved_at`, `activated_at`
- review references:
  - `reviewed_by_admin_id`, `admin_notes`
- activation security fields:
  - `activation_token_hash`, `activation_link_expires_at`, `last_activation_sent_at`
- output references:
  - `company_id`, `user_id`

### company_users

- tenant membership bridge
- `company_id`, `user_id`, `role`, `joined_at`

### users updates

- `enterprise_onboarding_completed_at`

## API Endpoints

### Public Enterprise Endpoints

1. `POST /api/v1/enterprise/demo-requests`
- Submit book-demo request
- Sends user confirmation email + admin notification email

2. `POST /api/v1/enterprise/onboarding/verify-company-id`
- Verifies `company_id` for an approved request token
- Returns locked email payload for first-time setup

3. `POST /api/v1/enterprise/onboarding/complete`
- Completes first-time setup
- Sets password, activates user, marks request as activated
- Returns bearer token

4. `POST /api/v1/enterprise/login`
- Standard subsequent login with email/password
- `company_id` not required

### Admin Endpoints (Web)

1. `GET /admin/enterprise/demo-requests`
2. `GET /admin/enterprise/demo-requests/{demoRequest}`
3. `PATCH /admin/enterprise/demo-requests/{demoRequest}/activate`

## Web Routes for Setup UI

1. `GET /onboarding/enterprise/first-time/{request}/{token}` (signed route)
2. `GET /login` (enterprise login page)

## Security Design

1. Signed onboarding links
- `URL::temporarySignedRoute(...)`
- Tamper protection and expiry at URL-signature level

2. Token hashing at rest
- Plain token is never stored
- `activation_token_hash = sha256(token)`

3. TTL enforcement
- `activation_link_expires_at` checked before verify/complete

4. One-time completion
- On success, token hash and expiry are cleared

5. Strict status checks
- verify/complete only allowed for `approved` requests

6. Duplicate protection
- prevents new pending/approved demo request for same email

## Email Flow

1. User confirmation email on request submission
2. Admin notification email on request submission
3. Activation email on admin approval with:
- onboarding link
- company_id
- setup instructions

All enterprise notifications implement `ShouldQueue`.

## Edge Cases and Handling

1. Duplicate pending request email
- returns `409`

2. Approve already activated request
- idempotent behavior, no duplicate account generation

3. Invalid company ID during setup
- returns `422`

4. Expired/invalid token
- returns `422`

5. Login before activation
- returns `401`

## Scalability Notes

1. Company model and membership table support multi-tenant growth
2. Separate service layer (`App\\Services\\Enterprise`) isolates business rules
3. Admin enterprise module sits under dedicated route namespace for future modules
4. Flow is additive and does not modify self-serve onboarding contracts

## Tests Added

1. `tests/Feature/Enterprise/BookDemoRequestTest.php`
2. `tests/Feature/Enterprise/AdminActivationTest.php`
3. `tests/Feature/Enterprise/FirstTimeSetupTest.php`
4. `tests/Feature/Enterprise/EnterpriseLoginTest.php`
