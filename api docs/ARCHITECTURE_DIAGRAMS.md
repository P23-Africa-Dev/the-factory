# System Architecture Diagrams

## 1. High-Level Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              THE FACTORY - ROLE-AWARE AUTHENTICATION             │
└─────────────────────────────────────────────────────────────────┘

                         User Attempts Login
                              │
                              ▼
                    ┌──────────────────────┐
                    │  Select User Type    │
                    │  (Tab/Radio Button)  │
                    └──────────────────────┘
                         │              │
            Self-Serve/Enterprise    Internal (Agent/Supervisor)
                         │              │
         ┌───────────────┘              └───────────────┐
         │                                              │
         ▼                                              ▼
    POST /api/auth/login                   POST /api/internal/login
         │                                              │
         ▼                                              ▼
    AdminAuthService                      InternalAuthService
    - Verify user exists                  - Verify user exists
    - Check: internal_role = NULL         - Check: internal_role != NULL
    - Check: is_active = true             - Check: is_active = true
    - Check: onboarding complete          - Check: onboarding_status = 'active'
    - Verify password                     - Verify password
         │                                              │
         ├─ Valid ─┐                   Valid ┌─ ✅ ─┤
         │         │                         │       │
         │         ▼                         ▼       │
         │    Create Token              Create Token │
         │    (30-day expiry)           (30-day exp)│
         │    Return user_type                  │       │
         │    (self-serve|enterprise)   Return role    │
         │                              (agent|super)  │
         │                                      │       │
         └─ Invalid ─────────────┬──────────────────────────┘
                                │
                                ▼
                          Return 401
                   Invalid credentials or
                   account not activated
```

---

## 2. User Role Determination

```
┌─────────────────────────────────────────────┐
│         User Role Determination             │
└─────────────────────────────────────────────┘

Check: user.internal_role

    │
    ├─ NULL (not set) ─────────────────────┐
    │                                      │
    │                             ┌────────▼──────────┐
    │                             │   Admin-Level     │
    │                             │   User Can Use:   │
    │                             │ /api/auth/login   │
    │                             └───────────────────┘
    │
    ├─ 'agent' ─────────────────────┐
    │                               │
    │                   ┌───────────▼──────────┐
    │                   │   Internal User      │
    │                   │   (Agent)            │
    │                   │ Can Use:             │
    │                   │ /api/internal/login  │
    │                   └──────────────────────┘
    │
    └─ 'supervisor' ────────────────┐
                                    │
                        ┌───────────▼──────────┐
                        │   Internal User      │
                        │   (Supervisor)       │
                        │ Can Use:             │
                        │ /api/internal/login  │
                        └──────────────────────┘
```

---

## 3. Database Schema Relationships

```
┌─────────────────────────────────────────────────────────────┐
│                        USERS TABLE                           │
├─────────────────────────────────────────────────────────────┤
│ id (PK)                                                     │
│ email                                                       │
│ password (hashed)                                           │
│ internal_role ◄─── ROLE DETERMINATION                       │
│              │      • NULL = Admin-level                    │
│              │      • 'agent' = Internal Agent              │
│              │      • 'supervisor' = Internal Supervisor    │
│              │                                               │
│ is_active                                                   │
│ onboarding_status ◄── ACTIVATION STATE                      │
│                 │    • NULL = not internal user             │
│                 │    • 'pending' = pending onboarding       │
│                 │    • 'active' = ready to login            │
│                 │                                            │
│ onboarding_completed_at ◄── SELF-SERVE (when set)           │
│ enterprise_onboarding_completed_at ◄── ENTERPRISE (when set)│
│ internal_onboarding_completed_at ◄── INTERNAL (when set)    │
│                                                              │
│ supervisor_user_id (FK) ──────┐                             │
│ invited_by_user_id (FK)       │ ◄── Agent Hierarchy       │
│                               │                              │
│ company_users (pivot) ◄────────────── Multi-Tenant Context  │
│ workspace_users (pivot) ◄────────────                        │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│            PERSONAL_ACCESS_TOKENS TABLE (Sanctum)            │
├──────────────────────────────────────────────────────────────┤
│ id (PK)                                                      │
│ tokenable_type = 'App\Models\User'                           │
│ tokenable_id (FK to users.id)                                │
│ name ◄─── 'admin_auth_token' or 'internal_auth_token'        │
│ token (hashed)                                               │
│ abilities = ['*']                                            │
│ expires_at (30 days from creation)                           │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. API Endpoint Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                      API ENDPOINTS                             │
└────────────────────────────────────────────────────────────────┘

PUBLIC ENDPOINTS (No authentication required)
├── POST /api/auth/register
│   └─ User registration with email + OTP
├── POST /api/auth/verify-email
│   └─ Email verification with OTP
├── POST /api/auth/resend-otp
│   └─ Resend OTP to email
│
├── POST /api/auth/login ◄────── NEW: Admin-Level Login
│   ├─ Users: Self-serve + Enterprise
│   ├─ Rate limit: 10/min
│   └─ Returns: Token + user_type + user
│
├── POST /api/enterprise/demo-requests
│   └─ Book demo/trial request
├── POST /api/enterprise/onboarding/verify-company-id
│   └─ Verify company for enterprise onboarding
├── POST /api/enterprise/onboarding/complete
│   └─ Complete enterprise first-time setup
├── POST /api/enterprise/login ◄─ DEPRECATED: Use /api/auth/login
│
├── POST /api/internal/login ◄──── Internal User Login
│   ├─ Users: Agents + Supervisors
│   ├─ Rate limit: 10/min
│   └─ Returns: Token + internal_role + user
├── POST /api/internal/onboarding/preview
│   └─ Preview onboarding (signed token)
└── POST /api/internal/onboarding/complete
    └─ Complete internal onboarding


AUTHENTICATED ENDPOINTS (Require Bearer token)
├── GET /api/user/me
│   └─ Get current authenticated user
├── POST /api/onboarding/workspace
│   └─ Create workspace (self-serve)
├── GET /api/tasks
│   └─ List tasks (internal users)
├── POST /api/tasks
│   └─ Create task
├── GET /api/tasks/{id}
│   └─ Get task details
├── PATCH /api/tasks/{id}/assign
│   └─ Assign task to agent
├── PATCH /api/tasks/{id}/status
│   └─ Update task status
├── POST /api/tasks/{id}/proofs
│   └─ Upload task proof
├── POST /api/internal-users
│   └─ Create internal user (admin only)
└── More endpoints...
```

---

## 5. Service Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SERVICE LAYER                                │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  AdminAuthService                                                │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  login(email, password): ?array                                 │
│  ├─ Find user by email                                          │
│  ├─ Verify: internal_role = NULL                                │
│  ├─ Verify: is_active = true                                    │
│  ├─ Verify: onboarding_completed_at OR                          │
│  │            enterprise_onboarding_completed_at != NULL        │
│  ├─ Verify password hash                                        │
│  └─ Return: [user, token, user_type]                            │
│                                                                  │
│  isAdminLevelUser(user): bool                                   │
│  └─ Return: !user.internal_role && user.is_active               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  InternalAuthService                                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  login(email, password): ?array                                 │
│  ├─ Find user by email                                          │
│  ├─ Verify: internal_role != NULL                               │
│  ├─ Verify: is_active = true                                    │
│  ├─ Verify: onboarding_status = 'active'                        │
│  ├─ Verify password hash                                        │
│  └─ Return: [user, token, internal_role]                        │
│                                                                  │
│  isInternalUser(user): bool                                     │
│  └─ Return: user.internal_role && user.is_active                │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  RoleAwareAuthService (Utilities)                                │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  getUserAuthRole(user): ?string                                 │
│  └─ Return: user.internal_role ? 'internal' : 'admin'           │
│                                                                  │
│  validateRoleAccess(user, endpoint): void                       │
│  ├─ Prevent admin accessing internal endpoint                   │
│  └─ Prevent internal accessing admin endpoint                   │
│                                                                  │
│  canAuthenticateAsAdmin(user): bool                             │
│  └─ Return: !user.internal_role                                 │
│                                                                  │
│  canAuthenticateAsInternal(user): bool                          │
│  └─ Return: user.internal_role != null                          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6. Request Validation Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│              REQUEST VALIDATION PIPELINE                            │
└─────────────────────────────────────────────────────────────────────┘

Client Request
    │
    ▼
┌──────────────────────────┐
│  HTTP Framework          │
│  (Laravel/Sanctum)       │
│  - CSRF Check            │
│  - CORS Check            │
│  - Rate Limiting         │
└──────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────┐
│  AdminLoginRequest / InternalLoginRequest Validation │
├──────────────────────────────────────────────────┤
│                                                  │
│  1. Check Required Fields                        │
│     ✓ email required                             │
│     ✓ password required                          │
│                                                  │
│  2. Check Field Types                            │
│     ✓ email must be string                       │
│     ✓ password must be string                    │
│                                                  │
│  3. Check Field Constraints                      │
│     ✓ email: RFC format, max 255                 │
│     ✓ password: min 8, max 255                   │
│                                                  │
│  4. Normalize Input                              │
│     ✓ email: convert to lowercase                │
│     ✓ password: trim (but preserve spaces)       │
└──────────────────────────────────────────────────┘
    │
    ├─ Validation Fails ─────────────────┐
    │                                    │
    │                                Return 422
    │                           (Unprocessable Entity)
    │
    ├─ Validation Passes ──────────────┐
    │                                  │
    ▼                                  ▼
┌─────────────────────────────────────────────┐
│  AuthService (AdminAuth or InternalAuth)    │
├─────────────────────────────────────────────┤
│                                             │
│  1. Find User                               │
│     ✓ Query database by email (lowercase)   │
│     ✗ User not found → Return null          │
│                                             │
│  2. Check Role                              │
│     ✓ Admin: internal_role = NULL           │
│     ✓ Internal: internal_role != NULL       │
│     ✗ Wrong role → Return null              │
│                                             │
│  3. Check Status                            │
│     ✓ is_active = true                      │
│     ✓ Onboarding state valid                │
│     ✗ Inactive/pending → Return null        │
│                                             │
│  4. Verify Password                         │
│     ✓ password_verify(plain, hashed)        │
│     ✗ Password mismatch → Return null       │
│                                             │
│  5. Generate Token                          │
│     ✓ Create Sanctum token (30-day exp)     │
│     ✓ Return: [user, token, role_info]      │
│                                             │
└─────────────────────────────────────────────┘
    │
    ├─ Auth Fails ──────────────────────────┐
    │                                       │
    │                          Return 401
    │            (Unauthorized - Invalid Credentials)
    │
    ├─ Auth Succeeds ───────────────────┐
    │                                   │
    ▼                                   ▼
┌─────────────────────────────────────────────┐
│  Controller Response                        │
├─────────────────────────────────────────────┤
│                                             │
│  Return 200 OK                              │
│  {                                          │
│    "success": true,                         │
│    "message": "Login successful",           │
│    "data": {                                │
│      "token": "<30-day token>",             │
│      "token_type": "Bearer",                │
│      "user_type": "...",  (admin only)      │
│      "internal_role": "...",  (internal)    │
│      "user": { user data }                  │
│    }                                        │
│  }                                          │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 7. Token Lifecycle

```
┌─────────────────────────────────────────────────────────────~~~~~~~~~~~~~~~~┐
│                         TOKEN LIFECYCLE                                    │
└─────────────────────────────────────────────────────────~~~~~~~~~~~~~~~~────┘

1️⃣  TOKEN CREATION
    ├─ User successfully authenticates
    ├─ Sanctum creates personal access token
    ├─ Token stored hashed in database
    └─ Plain token returned to client (only shown once!)

    Token Format: ID|HASH
    Example:      1|aB3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R


2️⃣  TOKEN STORAGE (Client)
    ├─ localStorage.setItem('auth_token', token)  ← Vulnerable to XSS
    ├─ sessionStorage.setItem('auth_token', token)  ← More secure
    ├─ Cookie with HttpOnly flag  ← Most secure
    └─ In-memory state  ← Lost on refresh


3️⃣  TOKEN USAGE
    ├─ Client includes in every API request:
    │  Authorization: Bearer <token>
    │
    ├─ Server receives request
    ├─ Sanctum middleware extracts token
    ├─ Middleware verifies token:
    │  ├─ Query personal_access_tokens table
    │  ├─ Hash provided token
    │  ├─ Compare to stored hash
    │  └─ Check expires_at timestamp
    ├─ On success: Load user context
    └─ On failure: Return 401 Unauthorized


4️⃣  TOKEN VALIDATION
    ┌─ Is token present in request?
    │  ├─ NO → 401 Unauthorized (missing token)
    │  └─ YES → Continue
    │
    ├─ Is token format valid?
    │  ├─ NO → 401 Unauthorized (malformed)
    │  └─ YES → Continue
    │
    ├─ Does token exist in database?
    │  ├─ NO → 401 Unauthorized (invalid token)
    │  └─ YES → Continue
    │
    ├─ Has token expired?
    │  ├─ YES → 401 Unauthorized (token expired)
    │  └─ NO → Continue
    │
    └─ Load user and verify active
       ├─ User not found → 401 Unauthorized
       ├─ User inactive → 401 Unauthorized
       └─ User active → PROCEED


5️⃣  TOKEN EXPIRATION (After 30 days)
    ├─ Token becomes invalid
    ├─ User receives 401 on next request
    ├─ Client redirects to login
    └─ User must re-authenticate


6️⃣  TOKEN INVALIDATION (Before Expiration)
    ▼
    Events that invalidate tokens:
    ├─ Password change
    │  └─ All tokens for user deleted
    ├─ Account deactivation
    │  └─ is_active set to false
    └─ Manual revocation (future feature)


7️⃣  TOKEN REFRESH (Currently Not Implemented)
    ├─ No refresh token endpoint
    ├─ No sliding expiration
    ├─ No token rotation
    └─ By design: Force re-authentication after 30 days
```

---

## 8. Error Response Flow

```
┌───────────────────────────────────────────────────────────────┐
│               ERROR RESPONSE FLOW                             │
└───────────────────────────────────────────────────────────────┘

Login Request
    │
    ▼
┌──────────────────────────────────────┐
│  Validate Input                      │
└──────────────────────────────────────┘
    │
    ├─ Invalid Email Format
    │  └─ 422 Unprocessable Entity
    │      {
    │        "message": "The email field must be a valid email.",
    │        "errors": {
    │          "email": ["The email field must be a valid email."]
    │        }
    │      }
    │
    ├─ Password Too Short
    │  └─ 422 Unprocessable Entity
    │      {
    │        "message": "The password field must be at least 8 characters.",
    │        "errors": {
    │          "password": ["The password field must be at least 8 characters."]
    │        }
    │      }
    │
    ├─ Missing Required Fields
    │  └─ 422 Unprocessable Entity
    │      {
    │        "message": "The email field is required.",
    │        "errors": {
    │          "email": ["The email field is required."],
    │          "password": ["The password field is required."]
    │        }
    │      }
    │
    └─ Validation Passes
       │
       ▼
    ┌──────────────────────────────────────┐
    │  Authenticate User                   │
    └──────────────────────────────────────┘
       │
       ├─ User Not Found
       │  └─ 401 Unauthorized
       │      {
       │        "success": false,
       │        "message": "Invalid credentials or account not activated.",
       │        "errors": {
       │          "email": ["Credentials are invalid or onboarding is not complete."]
       │        }
       │      }
       │      ⚠️  Generic message (no user enumeration)
       │
       ├─ Wrong Password
       │  └─ 401 Unauthorized
       │      (Same generic message as above)
       │
       ├─ Account Not Active
       │  └─ 401 Unauthorized
       │      (Same generic message as above)
       │
       ├─ Onboarding Not Complete
       │  └─ 401 Unauthorized
       │      (Same generic message as above)
       │
       ├─ Wrong Role (Admin using internal endpoint)
       │  └─ 401 Unauthorized
       │      (Same generic message as above)
       │
       └─ All Checks Pass
          │
          ▼
       ┌──────────────────────────────────────┐
       │  Generate Token & Return Success     │
       └──────────────────────────────────────┘


Special Cases:
──────────────

Rate Limit Exceeded (11th request in 1 minute):
    └─ 429 Too Many Requests
       {
         "message": "Too Many Requests"
       }

Server Error (Unexpected):
    └─ 500 Internal Server Error
       {
         "message": "Server error",
         "errors": { ... }
       }
       ℹ️  Full error logged internally, generic to client
```

---

## 9. Multi-Tenant Context Flow

```
┌──────────────────────────────────────────────────────────────┐
│         MULTI-TENANT CONTEXT RESOLUTION                     │
└──────────────────────────────────────────────────────────────┘

User Authenticates
    │
    ▼
Token Generated & Stored
    ├─ Token contains: user_id (NOT company_id)
    ├─ Token stored hashed in database
    └─ Sanctum creates personal_access_token record


For Each Authenticated Request
    │
    ├─ Request headers contain: Authorization: Bearer <token>
    │
    ▼
Sanctum Middleware
    ├─ Validates token
    ├─ Extracts user_id from token
    ├─ Loads User model
    └─ Sets $request->user() = User instance


Request Processing
    │
    ├─ endpoint: GET /api/tasks?company_id=5
    │   OR
    ├─ endpoint: GET /api/company/5/tasks
    │
    ▼
Controller Logic
    ├─ Extract company_id from request (route or query)
    ├─ Get user from $request->user()
    │
    ▼
Authorization Check
    ├─ Verify: user.id IN company_users(company_id=5)
    │
    │  Query: company_users
    │  WHERE company_id = 5
    │  AND user_id = <authenticated_user_id>
    │
    ├─ If NOT found:
    │  └─ Return 403 Forbidden (no access to this company)
    │
    └─ If found:
       ├─ Check user's role in company
       │  (admin, member, supervisor, agent, etc.)
       │
       └─ Proceed with request


Response
    │
    ├─ Include only data user has access to
    ├─ Company context isolated
    ├─ No data leaking between companies
    └─ Audit log: user_id, company_id, action, timestamp
```

---

This document provides visual representation of the authentication system architecture. Refer to detailed documentation files for complete specifications.

