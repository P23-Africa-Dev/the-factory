# Role-Aware Authentication System - Architecture Design

## System Overview

The Factory Backend implements a **unified, role-aware authentication system** that separates user authentication based on role, ensuring clear boundaries and preventing unauthorized endpoint access. This architecture supports three distinct user flows while maintaining a single SQL schema and unified API structure.

---

## Architecture Principles

### 1. Role-Based Separation
- **Clear Role Distinction**: Two distinct roles determined by the `internal_role` database field
- **Endpoint Isolation**: Different login endpoints for different roles
- **Prevention of Cross-Role Access**: Users cannot access endpoints meant for other roles

### 2. Unified Identity Model
- **Single User Table**: All users stored in one `users` table
- **Field-Based Role Determination**: `internal_role` field determines user type
- **Consistent Validation**: Same validation logic across all flows

### 3. Security-First Design
- **Password Hashing**: bcrypt with constant-time verification
- **Token-Based Auth**: Sanctum personal access tokens
- **Rate Limiting**: 10 requests/minute per IP on login endpoints
- **Generic Error Messages**: Prevent user enumeration

### 4. Scalability & Extensibility
- **Future-Ready Role Support**: Can add new roles without schema changes
- **Stateless Tokens**: No session storage required
- **Multi-Tenant Ready**: User context isolated per request

---

## Data Model

### User Role Definition

```sql
-- users table (simplified schema showing role fields)
CREATE TABLE users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    internal_role VARCHAR(50) NULLABLE,  -- NULL = admin, 'agent' = agent, 'supervisor' = supervisor
    onboarding_status VARCHAR(50) NULLABLE,  -- Current onboarding state
    onboarding_completed_at TIMESTAMP NULLABLE,
    enterprise_onboarding_completed_at TIMESTAMP NULLABLE,
    internal_onboarding_completed_at TIMESTAMP NULLABLE,
    is_active BOOLEAN DEFAULT TRUE,
    supervisor_user_id BIGINT NULLABLE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Sanctum tokens for API authentication
CREATE TABLE personal_access_tokens (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tokenable_type VARCHAR(255),
    tokenable_id BIGINT,
    name VARCHAR(255),
    token VARCHAR(80) UNIQUE NOT NULL,  -- Hashed token
    abilities JSON,
    last_used_at TIMESTAMP NULLABLE,
    expires_at TIMESTAMP NULLABLE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Role Matrix

| Role | `internal_role` | `onboarding_status` | Example Login | Use Case |
|------|-----------------|---------------------|---------------|----------|
| Self-Serve Admin | NULL | active | /api/auth/login | Individual users registering independently |
| Enterprise Admin | NULL | active | /api/auth/login | Company representatives |
| Agent | 'agent' | active | /api/internal/login | Field/support agents |
| Supervisor | 'supervisor' | active | /api/internal/login | Team leads/supervisors |

---

## Service Layer Architecture

### AdminAuthService

**Responsibility**: Handle login for admin-level users (self-serve + enterprise)

```php
class AdminAuthService {
    // Validates and authenticates admin-level users
    public function login(string $email, string $password): ?array
    
    // Checks if user is admin-level (no internal_role)
    public function isAdminLevelUser(User $user): bool
}
```

**Key Features**:
- Unified logic for self-serve and enterprise
- Distinguishes between self-serve and enterprise in response
- Returns `user_type` field: 'self-serve' or 'enterprise'
- Creates 30-day Sanctum tokens

### InternalAuthService

**Responsibility**: Handle login for internal users (agents + supervisors)

```php
class InternalAuthService {
    // Validates and authenticates internal users
    public function login(string $email, string $password): ?array
    
    // Checks if user is internal user (has internal_role)
    public function isInternalUser(User $user): bool
}
```

**Key Features**:
- Validates `internal_role` presence
- Validates `onboarding_status = 'active'`
- Returns `internal_role` in response
- Creates 30-day Sanctum tokens

### RoleAwareAuthService

**Responsibility**: Provide role validation utilities

```php
class RoleAwareAuthService {
    // Determines user's authentication role
    public static function getUserAuthRole(?User $user): ?string
    
    // Validates user has correct role for endpoint
    public static function validateRoleAccess(User $user, string $intendedEndpoint): void
    
    // Check if user can authenticate as admin
    public static function canAuthenticateAsAdmin(User $user): bool
    
    // Check if user can authenticate as internal
    public static function canAuthenticateAsInternal(User $user): bool
}
```

**Key Features**:
- Utility methods for role checking
- Prevents cross-role endpoint access
- Throws `InvalidRoleAccessException` on violation

---

## Controller Layer Architecture

### AdminLoginController

**Endpoint**: `POST /api/auth/login`

**Input**: AdminLoginRequest (email + password)

**Process**:
1. Validate request data
2. Call AdminAuthService::login()
3. Handle null response (invalid credentials)
4. Return token + user data + user_type

**Response**:
```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "token": "1|xxx...",
    "token_type": "Bearer",
    "user_type": "self-serve|enterprise",
    "user": { ... }
  }
}
```

### InternalLoginController

**Endpoint**: `POST /api/internal/login`

**Input**: InternalLoginRequest (email + password)

**Process**:
1. Validate request data
2. Call InternalAuthService::login()
3. Handle null response (invalid credentials)
4. Return token + user data + internal_role

**Response**:
```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "token": "2|yyy...",
    "token_type": "Bearer",
    "internal_role": "agent|supervisor",
    "user": { ... }
  }
}
```

---

## Request Validation

### AdminLoginRequest

```php
class AdminLoginRequest extends FormRequest {
    public function rules(): array {
        return [
            'email' => ['required', 'email:rfc', 'lowercase', 'max:255'],
            'password' => ['required', 'string', 'min:8', 'max:255'],
        ];
    }
}
```

**Validation Rules**:
- Email must be valid RFC format
- Email converted to lowercase before processing
- Password minimum 8 characters
- Both fields required

### InternalLoginRequest

```php
class InternalLoginRequest extends FormRequest {
    public function rules(): array {
        return [
            'email' => ['required', 'email:rfc', 'lowercase', 'max:255'],
            'password' => ['required', 'string', 'min:8', 'max:255'],
        ];
    }
}
```

**Same validation as AdminLoginRequest**

---

## Token Management

### Token Generation

```php
$token = $user->createToken(
    name: 'admin_auth_token|internal_auth_token',
    abilities: ['*'],
    expiresAt: now()->addDays(30),
);

return $token->plainTextToken;  // Returns: "1|hashedtoken"
```

### Token Format

```
ID|HASH
1|aB3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R9S1T2
```

- **ID**: Personal access token ID
- **Hash**: Hashed token for verification
- **Full Format for Headers**: `Bearer <ID|HASH>`

### Token Lifespan

- **Duration**: 30 days from creation
- **Automatic Expiration**: After expiry, token becomes invalid
- **Events that Invalidate**: Password change, account deactivation
- **No Refresh**: User must login again (security-first design)

### Using Tokens

```
Authorization: Bearer <token>
```

Protected endpoints verify token via Sanctum middleware:
```php
Route::middleware('auth:sanctum')->group(function () {
    // Protected routes
});
```

---

## Authentication Flow Diagrams

### Self-Serve User Flow

```
┌─────────────────────────────────────────────────────────┐
│                   SELF-SERVE FLOW                       │
└─────────────────────────────────────────────────────────┘

1. Register
   POST /api/auth/register
   → Email sent with OTP
   
2. Verify Email (OTP)
   POST /api/auth/verify-email
   → Sets onboarding_completed_at
   → Sets internal_role = NULL
   
3. Complete Onboarding (Create Workspace)
   POST /api/onboarding/workspace
   → Creates workspace
   → User is now admin-level
   
4. Login
   POST /api/auth/login
   → Verifies internal_role = NULL
   → Verifies onboarding_completed_at != NULL
   → Returns token + user_type: 'self-serve'
   
5. Use Token
   GET /api/user/me (with Bearer token)
   → Access all admin-level endpoints
```

### Enterprise User Flow

```
┌─────────────────────────────────────────────────────────┐
│                 ENTERPRISE FLOW                         │
└─────────────────────────────────────────────────────────┘

1. Book Demo / Request Trial
   POST /api/enterprise/demo-requests
   
2. Admin Approves Demo Request
   (Backend/Dashboard action)
   
3. Send Signed Onboarding Link
   (Email sent to user)
   
4. Verify Company ID
   POST /api/enterprise/onboarding/verify-company-id
   → Validates company code
   
5. Complete First-Time Setup
   POST /api/enterprise/onboarding/complete
   → Creates password
   → Sets enterprise_onboarding_completed_at
   → Sets internal_role = NULL
   
6. Login
   POST /api/auth/login
   → Verifies internal_role = NULL
   → Verifies enterprise_onboarding_completed_at != NULL
   → Returns token + user_type: 'enterprise'
   
7. Use Token
   GET /api/user/me (with Bearer token)
   → Access all admin-level endpoints
```

### Internal User (Agent/Supervisor) Flow

```
┌─────────────────────────────────────────────────────────┐
│             INTERNAL USER FLOW                          │
└─────────────────────────────────────────────────────────┘

1. Admin/Supervisor Creates User
   POST /api/internal-users
   → User record created with internal_role = 'agent'|'supervisor'
   → onboarding_status = 'pending'
   → Email sent with signed invite link
   
2. Preview Onboarding
   POST /api/internal/onboarding/preview
   → Validates signed token
   → Returns prefilled data if provided
   
3. Complete Onboarding
   POST /api/internal/onboarding/complete
   → Accepts password + profile data
   → Sets password (hashed)
   → Sets onboarding_status = 'active'
   → Sets internal_onboarding_completed_at
   
4. Login
   POST /api/internal/login
   → Verifies internal_role != NULL
   → Verifies onboarding_status = 'active'
   → Returns token + internal_role
   
5. Use Token
   GET /api/user/me (with Bearer token)
   → Access agent/supervisor endpoints
```

---

## Error Handling Strategy

### HTTP Status Codes

| Code | Scenario | Response |
|------|----------|----------|
| 200 | Successful login | User data + token |
| 401 | Invalid credentials or wrong role | Generic error message |
| 403 | Invalid role access attempt | Specific role error |
| 422 | Validation error | Field-level errors |
| 429 | Rate limit exceeded | Too Many Requests |
| 500 | Unexpected error | Logged, generic message |

### Error Response Format

```json
{
  "success": false,
  "message": "User-facing error message",
  "errors": {
    "field": ["Specific validation error"]
  }
}
```

### Invalid Credentials Response

```json
{
  "success": false,
  "message": "Invalid credentials or account not activated.",
  "errors": {
    "email": ["Credentials are invalid or onboarding is not complete."]
  }
}
```

**Why Generic Message?**
- Prevents user enumeration attacks
- Doesn't reveal if email exists in system
- Doesn't reveal if user is inactive
- Doesn't reveal if user hasn't completed onboarding

---

## Security Implementation

### 1. Password Hashing

```php
// Storage (Laravel automatically hashes on create)
$user->password = $password;  // Automatically hashed via 'hashed' cast

// Verification (constant-time comparison)
password_verify($plainPassword, $user->password)
```

**Algorithm**: bcrypt (Industry standard, resistant to GPU/ASIC attacks)

### 2. Rate Limiting

```php
Route::post('/login', AdminLoginController::class)
    ->middleware('throttle:10,1')  // 10 requests per 1 minute per IP
    ->name('login');
```

**Protection**: Prevents brute force attacks

### 3. CSRF Protection

```php
// Cross-Origin Resource Sharing configured
// SameSite cookie flag set on tokens
```

### 4. Token Security

```php
// Token stored hashed in database (only hash stored)
// Plain token shown only once (login response)
// Token invalidated on: expiry, password change, account deactivation
```

### 5. HTTPS/TLS

```php
// In production:
// - All endpoints use HTTPS
// - HSTS header enabled
// - Secure flag on cookies
// - SameSite=Strict on cookies
```

### 6. Input Validation

```php
// All inputs validated before processing
// Email normalized to lowercase
// Password constraints enforced
// Malicious input rejected
```

---

## Multi-Tenant Architecture Integration

### Company/Tenant Resolution

```php
// After user logs in with token:
// 1. User context is loaded from token
// 2. For each request, system determines user's companies/workspaces
// 3. Endpoint validates user has access to requested resource

// Token contains user_id but NOT company_id
// Company_id passed in request or derived from resource
// Access validated via pivot tables: company_users, workspace_users
```

### Tenant Isolation

| Request Type | Tenant Resolution | Validation |
|--------------|-------------------|-----------|
| Admin lists own tasks | User derived from token | User must own workspace |
| Agent views assigned tasks | User + company from route | Agent must belong to company |
| Supervisor manages team | User + company from route | Supervisor must manage this company |

---

## Testing Strategy

### Test Categories

1. **Happy Path Tests**:
   - Self-serve user login succeeds
   - Enterprise user login succeeds
   - Agent login succeeds
   - Supervisor login succeeds

2. **Role Separation Tests**:
   - Agent cannot use /api/auth/login
   - Supervisor cannot use /api/auth/login
   - Self-serve cannot use /api/internal/login
   - Enterprise cannot use /api/internal/login

3. **Validation Tests**:
   - Invalid email rejected
   - Invalid password rejected
   - Missing fields rejected
   - Invalid formats rejected

4. **State Tests**:
   - Inactive user cannot login
   - User with pending onboarding cannot login
   - User without completed onboarding cannot login

5. **Security Tests**:
   - Rate limiting works
   - Token format validated
   - Expired tokens rejected
   - Generic error messages

6. **Edge Case Tests**:
   - Null values handled correctly
   - Empty strings rejected
   - Whitespace trimmed properly
   - Case-insensitive email matching

### Example Test Structure

```php
class RoleAwareAuthenticationTest extends TestCase {
    use RefreshDatabase;
    
    // Setup: Create test users of each type
    // Tests: Happy paths (✅)
    // Tests: Role violations (❌)
    // Tests: Validation errors
    // Tests: Security measures
}
```

---

## Configuration

### Environment Variables

```ini
# .env
APP_NAME="The Factory"
APP_ENV=production
LOG_CHANNEL=stack

# Sanctum
SANCTUM_GUARD=web
SANCTUM_TOKEN_PREFIX=LaravelSanctum  # Or custom prefix

# Database
DB_CONNECTION=mysql
DB_HOST=mysql
DB_PORT=3306
DB_DATABASE=factory

# Session/Cookie
SESSION_DRIVER=database
COOKIE_SECURE=true
COOKIE_HTTP_ONLY=true
COOKIE_SAME_SITE=Lax
```

### Rate Limiting Configuration

```php
// config/sanctum.php
return [
    'expiration' => null,  // No expiration for Sanctum itself
    // Token expiration set in service layer (30 days)
];

// config/auth.php
'guards' => [
    'sanctum' => [
        'driver' => 'sanctum',
        'provider' => 'users',
    ],
];
```

---

## Monitoring & Logging

### Events to Log

```
1. Login attempts (success + failure)
   → User ID, email, role, timestamp, IP

2. Failed login reasons
   → Invalid credentials
   → Inactive account
   → Wrong role

3. Token usage
   → Which endpoints accessed
   → Frequency of use

4. Security violations
   → Rate limit exceeded
   → Invalid token attempts
   → Cross-role access attempts
```

### Logging Configuration

```php
// Log failed logins
Log::channel('auth')->warning('Failed login', [
    'email' => $email,
    'ip' => request()->ip(),
    'reason' => 'invalid_credentials',
    'timestamp' => now(),
]);

// Log successful logins
Log::channel('auth')->info('Successful login', [
    'user_id' => $user->id,
    'email' => $user->email,
    'role' => $role,
    'ip' => request()->ip(),
    'timestamp' => now(),
]);
```

---

## Deployment Checklist

- [x] Code implemented and tested
- [x] API documentation created
- [ ] Database migrations applied
- [ ] Environment variables configured
- [ ] HTTPS/TLS certificates generated
- [ ] Rate limiting tested
- [ ] Error messages verified (no sensitive data)
- [ ] Logging configured
- [ ] Monitoring alerts set up
- [ ] Backup strategy in place
- [ ] Load balancer scaled for tokens (Redis)
- [ ] Performance load testing done
- [ ] Security audit completed
- [ ] User documentation written

---

## Backward Compatibility

### Deprecated Endpoints

```
POST /api/enterprise/login
→ Deprecated: Use POST /api/auth/login instead
→ Still works for existing integrations
→ Will be removed in v2.0
```

### Migration Path for Clients

```
Old (deprecated):
POST /api/enterprise/login → Returns token

New (recommended):
POST /api/auth/login → Returns token + user_type

Benefits:
- Single endpoint for all admin users
- Clearer API structure
- Better documentation
```

---

## Future Enhancements

### Phase 2: Multi-Factor Authentication
```php
// Add MFA verification before token generation
// Support TOTP (Google Authenticator)
// Support SMS-based OTP
// Backup codes for account recovery
```

### Phase 3: OAuth/OpenID Connect
```php
// Support third-party authentication
// GitHub, Google, Microsoft login
// Reduces password management burden
```

### Phase 4: Advanced Token Management
```php
// Token refresh mechanism
// Separate read/write abilities
// Token revocation on demand
// Device tracking
```

### Phase 5: Enterprise SSO
```php
// SAML 2.0 support
// LDAP integration
// JWT token exchange
// Cross-organization authentication
```

---

## References

### Laravel Documentation
- [Sanctum Authentication](https://laravel.com/docs/sanctum)
- [Password Hashing](https://laravel.com/docs/hashing)
- [Rate Limiting](https://laravel.com/docs/rate-limiting)
- [Validation](https://laravel.com/docs/validation)

### Security Standards
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [RFC 7235: HTTP Authentication](https://tools.ietf.org/html/rfc7235)

### Best Practices
- [REST API Best Practices](https://restfulapi.net/)
- [API Security Best Practices](https://www.owasp.org/index.php/REST_Security_Cheat_Sheet)

