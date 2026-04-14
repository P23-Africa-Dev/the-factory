# Role-Aware Authentication System - API Documentation

## System Overview

The Factory Backend implements a unified, role-aware authentication system with separate login entry points for different user types:

- **Admin-level users** (self-serve + enterprise) → `/api/auth/login`
- **Internal users** (agents + supervisors) → `/api/internal/login`

This design ensures clear role separation and prevents unauthorized endpoint access.

---

## Authentication Roles

### Admin-Level Users
- **Self-serve admins**: Users who completed self-serve onboarding
- **Enterprise admins**: Users who completed enterprise onboarding
- **Endpoint**: `POST /api/auth/login`
- **Requirements**: `internal_role` must be NULL, `is_active` must be true

### Internal Users
- **Agents**: Internal users with `internal_role = 'agent'`
- **Supervisors**: Internal users with `internal_role = 'supervisor'`
- **Endpoint**: `POST /api/internal/login`
- **Requirements**: `internal_role` must be set, `onboarding_status = 'active'`, `is_active` must be true

---

## Database User Structure

```
users table:
├── id (primary key)
├── email (unique)
├── password (hashed)
├── name
├── internal_role (nullable: 'agent', 'supervisor', or NULL for admin-level)
├── onboarding_status ('active', 'pending', or NULL)
├── onboarding_completed_at (self-serve completion)
├── enterprise_onboarding_completed_at (enterprise completion)
├── internal_onboarding_completed_at (internal completion)
├── is_active (boolean, default: true)
├── deactivated_at (timestamp, nullable)
└── ...other fields
```

---

## API Endpoints

### 1. Admin Login (Unified)

**Endpoint**: `POST /api/auth/login`

**Purpose**: Authenticate self-serve and enterprise admin-level users

**Rate Limiting**: 10 requests per 1 minute

**Request Headers**:
```
Content-Type: application/json
```

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Validation Rules**:
| Field | Type | Rules |
|-------|------|-------|
| email | string | required, valid email format, lowercase, max 255 chars |
| password | string | required, min 8 chars, max 255 chars |

**Success Response (200)**:
```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "token": "1|aB3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R9S1T2",
    "token_type": "Bearer",
    "user_type": "self-serve|enterprise",
    "user": {
      "id": 1,
      "email": "user@example.com",
      "name": "John Doe",
      "avatar": "avatar_url",
      "email_verified_at": "2026-04-13T10:00:00Z",
      "onboarding_completed_at": "2026-04-13T09:00:00Z",
      "is_active": true,
      "created_at": "2026-04-13T08:00:00Z",
      "updated_at": "2026-04-13T10:00:00Z"
    }
  }
}
```

**Error Response - Invalid Credentials (401)**:
```json
{
  "success": false,
  "message": "Invalid credentials or account not activated.",
  "errors": {
    "email": [
      "Credentials are invalid or onboarding is not complete."
    ]
  }
}
```

**Error Response - Validation Error (422)**:
```json
{
  "message": "The email field is required.",
  "errors": {
    "email": ["The email field is required."],
    "password": ["The password field is required."]
  }
}
```

**Error Response - Rate Limited (429)**:
```json
{
  "message": "Too Many Requests"
}
```

**Use Cases**:
- ✅ Self-serve user login
- ✅ Enterprise admin login
- ✅ Returning user login after onboarding
- ❌ Agent/Supervisor login (returns 401)
- ❌ Internal users (returns 401)

---

### 2. Internal User Login

**Endpoint**: `POST /api/internal/login`

**Purpose**: Authenticate internal users (agents and supervisors)

**Rate Limiting**: 10 requests per 1 minute

**Request Headers**:
```
Content-Type: application/json
```

**Request Body**:
```json
{
  "email": "agent@example.com",
  "password": "securepassword123"
}
```

**Validation Rules**:
| Field | Type | Rules |
|-------|------|-------|
| email | string | required, valid email format, lowercase, max 255 chars |
| password | string | required, min 8 chars, max 255 chars |

**Success Response (200)**:
```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "token": "2|xY9Z1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q",
    "token_type": "Bearer",
    "internal_role": "agent|supervisor",
    "user": {
      "id": 2,
      "email": "agent@example.com",
      "name": "Jane Agent",
      "internal_role": "agent",
      "onboarding_status": "active",
      "is_active": true,
      "supervisor_user_id": 3,
      "assigned_zone": "Zone A",
      "work_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      "base_salary": 2000.00,
      "salary_currency": "USD",
      "commission_enabled": true,
      "created_at": "2026-04-10T08:00:00Z",
      "updated_at": "2026-04-13T10:00:00Z"
    }
  }
}
```

**Error Response - Invalid Credentials (401)**:
```json
{
  "success": false,
  "message": "Invalid credentials or onboarding not completed.",
  "errors": {
    "email": [
      "Credentials are invalid or onboarding is not complete."
    ]
  }
}
```

**Error Response - Validation Error (422)**:
```json
{
  "message": "The email field is required.",
  "errors": {
    "email": ["The email field is required."],
    "password": ["The password field is required."]
  }
}
```

**Use Cases**:
- ✅ Agent login
- ✅ Supervisor login
- ✅ Internal user login after onboarding completion
- ❌ Self-serve user login (returns 401)
- ❌ Enterprise admin login (returns 401)
- ❌ Admin-level users (returns 401)

---

## Authentication Flow

### Admin-Level User Login Flow

```
1. User submits email + password to POST /api/auth/login
   ↓
2. System verifies user exists
   ↓
3. System checks:
   - is_active = true
   - internal_role = NULL (no internal role)
   - (onboarding_completed_at != NULL) OR (enterprise_onboarding_completed_at != NULL)
   ↓
4. If checks pass:
   - Verify password hash
   - Generate 30-day Sanctum token
   - Return token + user data + user type (self-serve|enterprise)
   ↓
5. If checks fail:
   - Return 401 with generic error message
```

### Internal User Login Flow

```
1. User submits email + password to POST /api/internal/login
   ↓
2. System verifies user exists
   ↓
3. System checks:
   - is_active = true
   - internal_role IN ('agent', 'supervisor')
   - onboarding_status = 'active'
   ↓
4. If checks pass:
   - Verify password hash
   - Generate 30-day Sanctum token
   - Return token + user data + internal role
   ↓
5. If checks fail:
   - Return 401 with generic error message
```

---

## Token Usage

### Token Format

```
Bearer <token>
Example: Bearer 1|aB3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R9S1T2
```

### Using the Token

```
Authorization: Bearer <token>
```

**Example Request**:
```bash
curl -X GET http://localhost:8000/api/user/me \
  -H "Authorization: Bearer 1|aB3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R9S1T2" \
  -H "Content-Type: application/json"
```

### Token Lifespan

- **Duration**: 30 days
- **Type**: Sanctum personal access token
- **Revocation**: Auto-revoked after 30 days or on password change
- **Scope**: Full abilities (*)

---

## Using Authenticated Endpoints

All authenticated endpoints require a valid Bearer token in the Authorization header.

**Example Authenticated Endpoint**:
```
GET /api/user/me
Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "message": "User retrieved successfully.",
  "data": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "avatar": "avatar_url",
    "is_active": true,
    ...
  }
}
```

---

## Error Handling & Response Codes

### HTTP Status Codes

| Code | Meaning | When |
|------|---------|------|
| 200 | OK | Successful login |
| 401 | Unauthorized | Invalid credentials, inactive user, wrong role |
| 403 | Forbidden | Invalid role access attempt |
| 422 | Unprocessable Entity | Validation errors |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |

### Response Format

**Success**:
```json
{
  "success": true,
  "message": "Login successful.",
  "data": { ... }
}
```

**Error**:
```json
{
  "success": false,
  "message": "Error description",
  "errors": {
    "field": ["Error message"]
  }
}
```

---

## Security Considerations

### Password Security
- All passwords are hashed with bcrypt before storage
- Password verification uses constant-time comparison to prevent timing attacks
- Minimum 8 characters required

### Rate Limiting
- Login endpoints: 10 requests per 1 minute per IP
- Prevents brute force attacks
- Returns 429 Too Many Requests when exceeded

### Token Security
- Sanctum personal access tokens used
- Tokens stored securely in database
- Tokens expire after 30 days
- Password change invalidates existing tokens
- API endpoints require valid Bearer token

### Data Protection
- User passwords are never returned in API responses
- Error messages are generic to prevent user enumeration
- No sensitive data exposed in error messages
- HTTPS/TLS encryption required in production

### Multi-Tenancy
- Tokens scoped to individual user
- User context verified on every authenticated request
- Company/workspace context validation on access

---

## Role Validation Logic

### Role Determination

The system determines user role based on `internal_role` field:

```php
if (user.internal_role is set) {
    user_role = 'internal'  // Can use /api/internal/login
} else {
    user_role = 'admin'     // Can use /api/auth/login
}
```

### Endpoint Access Rules

| User Type | /api/auth/login | /api/internal/login |
|-----------|-----------------|---------------------|
| Self-serve (internal_role = NULL) | ✅ | ❌ |
| Enterprise (internal_role = NULL) | ✅ | ❌ |
| Agent (internal_role = 'agent') | ❌ | ✅ |
| Supervisor (internal_role = 'supervisor') | ❌ | ✅ |

---

## Integration Examples

### JavaScript/TypeScript

```typescript
// Admin Login
const loginAdmin = async (email: string, password: string) => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const result = await response.json();
  
  if (result.success) {
    localStorage.setItem('auth_token', result.data.token);
    localStorage.setItem('user_type', result.data.user_type);
    return result.data.user;
  }
  
  throw new Error(result.message);
};

// Internal Login
const loginInternal = async (email: string, password: string) => {
  const response = await fetch('/api/internal/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const result = await response.json();
  
  if (result.success) {
    localStorage.setItem('auth_token', result.data.token);
    localStorage.setItem('internal_role', result.data.internal_role);
    return result.data.user;
  }
  
  throw new Error(result.message);
};

// Authenticated API Call
const getMe = async (token: string) => {
  const response = await fetch('/api/user/me', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  return response.json();
};
```

### Python

```python
import requests

# Admin Login
def login_admin(email: str, password: str):
    response = requests.post('http://localhost:8000/api/auth/login', json={
        'email': email,
        'password': password,
    })
    
    if response.status_code == 200:
        result = response.json()
        token = result['data']['token']
        user_type = result['data']['user_type']
        return token, user_type
    
    raise Exception(response.json()['message'])

# Internal Login
def login_internal(email: str, password: str):
    response = requests.post('http://localhost:8000/api/internal/login', json={
        'email': email,
        'password': password,
    })
    
    if response.status_code == 200:
        result = response.json()
        token = result['data']['token']
        internal_role = result['data']['internal_role']
        return token, internal_role
    
    raise Exception(response.json()['message'])

# Authenticated API Call
def get_me(token: str):
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
    }
    
    response = requests.get('http://localhost:8000/api/user/me', headers=headers)
    return response.json()
```

### cURL

```bash
# Admin Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123"
  }'

# Internal Login
curl -X POST http://localhost:8000/api/internal/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "agent@example.com",
    "password": "securepassword123"
  }'

# Authenticated Request
curl -X GET http://localhost:8000/api/user/me \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json"
```

---

## Edge Cases & Troubleshooting

### Common Issues

#### 1. User Cannot Login

**Possible Causes**:
- Wrong password
- User account is inactive (`is_active = false`)
- User has not completed onboarding
- Wrong endpoint for user role (admin → internal or vice versa)

**Solutions**:
- Verify password is correct
- Check `is_active` flag in database
- Check `onboarding_completed_at` or `enterprise_onboarding_completed_at`
- Use correct endpoint for user's role

#### 2. 401 Unauthorized on Login

**When**:
- Invalid credentials provided
- User is inactive
- User onboarding not completed
- User trying internal login without `internal_role`
- User trying admin login with `internal_role` set

**Resolution**:
- Verify email and password
- Check user account status
- Ensure user has completed appropriate onboarding flow

#### 3. 429 Too Many Requests

**When**:
- More than 10 login attempts in 1 minute (per IP)

**Resolution**:
- Wait 1 minute before retrying
- Use exponential backoff in client
- Implement account lockout after N failed attempts

#### 4. Token Expired

**When**:
- More than 30 days have passed since login
- User password was changed

**Resolution**:
- User must login again to get new token
- No token refresh endpoint (design choice for simplicity)

#### 5. Invalid Token on Authenticated Request

**When**:
- Token is malformed
- Token has expired
- Token was revoked

**Resolution**:
- Return to login endpoint
- Implement token refresh logic on client if needed
- Handle 401 responses with re-authentication flow

---

## Testing the API

### Using Postman

1. **Import Environment Variables**:
```json
{
  "admin_token": "your_admin_token_here",
  "internal_token": "your_internal_token_here",
  "base_url": "http://localhost:8000"
}
```

2. **Test Admin Login**:
   - Method: POST
   - URL: `{{base_url}}/api/auth/login`
   - Body: 
   ```json
   {
     "email": "user@example.com",
     "password": "password123"
   }
   ```
   - Tests:
   ```javascript
   pm.environment.set("admin_token", pm.response.json().data.token);
   ```

3. **Test Internal Login**:
   - Method: POST
   - URL: `{{base_url}}/api/internal/login`
   - Body:
   ```json
   {
     "email": "agent@example.com",
     "password": "password123"
   }
   ```
   - Tests:
   ```javascript
   pm.environment.set("internal_token", pm.response.json().data.token);
   ```

4. **Test Authenticated Endpoint**:
   - Method: GET
   - URL: `{{base_url}}/api/user/me`
   - Headers:
     - Authorization: `Bearer {{admin_token}}`

---

## Deployment Checklist

- [ ] HTTPS/TLS configured in production
- [ ] Rate limiting enabled and tested
- [ ] Password hashing algorithm (bcrypt) verified
- [ ] Token expiration set to 30 days in production
- [ ] Sanctum middleware configured correctly
- [ ] Error messages sanitized (no internal details)
- [ ] Database migration applied (`internal_role` field)
- [ ] Email validation implemented if needed
- [ ] CORS configuration appropriate for frontend domain
- [ ] Audit logging enabled for authentication events
- [ ] Monitoring/alerts set for failed login attempts
- [ ] Database backups include token storage
- [ ] Load balancing configured for token sharing across servers (Redis session store)

---

## Future Enhancements

1. **Multi-Factor Authentication (MFA)**: Add TOTP/SMS verification
2. **OAuth/OpenID Connect**: Third-party integration support
3. **Token Refresh**: Implement refresh token rotation
4. **Single Sign-On (SSO)**: Enterprise SSO integration
5. **Password Reset**: Email-based password recovery
6. **Device Tracking**: Track login devices and locations
7. **Session Revocation**: Invalidate tokens on demand
8. **Audit Logging**: Complete login attempt history
9. **IP Whitelisting**: Restrict logins to known IPs
10. **2FA**: SMS or authenticator app support

