# Role-Aware Authentication - Quick Reference

## 🚀 One-Minute Overview

**Two login endpoints, one for each user type:**

| User | Endpoint | Response |
|------|----------|----------|
| Self-serve + Enterprise (Admins) | `POST /api/auth/login` | `{token, user_type}` |
| Agents + Supervisors (Internal) | `POST /api/internal/login` | `{token, internal_role}` |

**Key Principle**: Users can ONLY login via their designated endpoint - no cross-role access allowed.

---

## 📋 For Frontend Developers

### Login Request

```bash
# Admin Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Internal Login  
curl -X POST http://localhost:8000/api/internal/login \
  -H "Content-Type: application/json" \
  -d '{"email":"agent@example.com","password":"password123"}'
```

### Success Response (200)

```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "token": "1|aB3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R9S1T2",
    "token_type": "Bearer",
    "user_type": "self-serve|enterprise",  // Admin only
    "internal_role": "agent|supervisor",   // Internal only
    "user": { "id": 1, "email": "...", "name": "..." }
  }
}
```

### Error Response (401)

```json
{
  "success": false,
  "message": "Invalid credentials or account not activated.",
  "errors": {
    "email": ["Credentials are invalid or onboarding is not complete."]
  }
}
```

### Use Token

```bash
Authorization: Bearer <token>
```

---

## 🔍 Endpoint Choosing Guide

**Ask yourself**: What is the user's `internal_role` field in the database?

```
internal_role = NULL
├─ USER IS ADMIN-LEVEL
├─ Use: POST /api/auth/login
└─ Response includes: user_type (self-serve|enterprise)

internal_role = 'agent' or 'supervisor'  
├─ USER IS INTERNAL
├─ Use: POST /api/internal/login
└─ Response includes: internal_role (agent|supervisor)
```

---

## 🧪 Test Credentials

**Admin Users**: (internal_role = NULL)
```
Email: selfserve@example.com
Password: password123
Endpoint: POST /api/auth/login

Email: enterprise@example.com
Password: password123
Endpoint: POST /api/auth/login
```

**Internal Users**: (internal_role set)
```
Email: agent@example.com
Password: password123
Endpoint: POST /api/internal/login

Email: supervisor@example.com
Password: password123
Endpoint: POST /api/internal/login
```

---

## 🐛 Troubleshooting Quick Guide

### Problem: "Invalid credentials" on valid login?

1. **Check password** - ensure it's correct
2. **Check account active** - is `is_active = true`?
3. **Check onboarding** - did user complete onboarding?
4. **Check endpoint** - are you using the correct endpoint?

### Problem: User can't login via internal endpoint?

**✅ Use `/api/internal/login` ONLY if** `internal_role` is set to 'agent' or 'supervisor'

**❌ If `internal_role = NULL`** → Use `/api/auth/login` instead

### Problem: "Too Many Requests" (429)?

Max 10 login attempts per 1 minute per IP address. **Wait 1 minute** before retrying.

### Problem: Token doesn't work on next day?

Token expires after 30 days. User must **login again** to get new token.

---

## 📚 Documentation Files

All in `backend/docs/`:

| File | For Whom | Purpose |
|------|----------|---------|
| `features/authentication.md` | Frontend/Mobile devs | API endpoints & examples |
| `authentication-architecture.md` | Backend devs & architects | System design & internals |
| `frontend-integration-guide.md` | Frontend team | React hooks & implementation |
| `ARCHITECTURE_DIAGRAMS.md` | Everyone | Visual flowcharts |
| `IMPLEMENTATION_SUMMARY.md` | All devs | What was built & checklist |

---

## 🛠️ Backend Quick Reference

### Service Classes

```php
// Handle admin login (self-serve + enterprise)
AdminAuthService::login($email, $password): ?array

// Handle internal login (agents + supervisors)  
InternalAuthService::login($email, $password): ?array

// Utility methods
RoleAwareAuthService::getUserAuthRole($user): ?string
RoleAwareAuthService::canAuthenticateAsAdmin($user): bool
RoleAwareAuthService::canAuthenticateAsInternal($user): bool
```

### Controllers

```php
// New unified endpoint
POST /api/auth/login
→ AdminLoginController

// Internal users
POST /api/internal/login
→ InternalLoginController

// Deprecated (still works)
POST /api/enterprise/login
→ EnterpriseLoginController
```

### Test File

```bash
tests/Feature/Auth/RoleAwareAuthenticationTest.php
# 20+ test cases covering all scenarios
```

---

## 🔐 Security Checklist

- ✅ Passwords hashed with bcrypt
- ✅ Rate limiting: 10 requests/minute
- ✅ Generic error messages (no user enumeration)
- ✅ Bearer token authentication
- ✅ 30-day token expiration
- ✅ CSRF protection
- ✅ Input validation
- ✅ SQL injection prevention (ORM)

---

## 📊 API Status Codes

| Code | Meaning | When |
|------|---------|------|
| 200 | Login successful | Valid credentials + right role |
| 401 | Unauthorized | Invalid credentials, wrong role, or inactive |
| 422 | Validation error | Missing/invalid fields |
| 429 | Rate limited | > 10 requests/minute |

---

## 🎯 Common Use Cases

### React App Login Flow

```typescript
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
const [userType, setUserType] = useState('admin');

const handleLogin = async () => {
  const endpoint = userType === 'admin' 
    ? '/api/auth/login' 
    : '/api/internal/login';
    
  const res = await fetch(endpoint, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  
  const data = await res.json();
  if (data.success) {
    localStorage.setItem('token', data.data.token);
    redirect(userType === 'admin' ? '/dashboard' : '/agent-dashboard');
  }
};
```

### Next.js Authenticated Fetch

```typescript
const fetchData = async (url: string, token: string) => {
  const res = await fetch(`${API_BASE}/api${url}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return res.json();
};

// Usage
const data = await fetchData('/tasks', token);
```

---

## 📞 Need Help?

### For Technical Questions

1. Check [authentication-architecture.md](./authentication-architecture.md) for design details
2. Check [features/authentication.md](./features/authentication.md) for endpoint details
3. Read test file at `tests/Feature/Auth/RoleAwareAuthenticationTest.php`
4. Check code comments in service classes

### For Implementation Help

1. Use [frontend-integration-guide.md](./frontend-integration-guide.md) for React/Next.js
2. Use code examples in [features/authentication.md](./features/authentication.md)
3. Reference [ARCHITECTURE_DIAGRAMS.md](./ARCHITECTURE_DIAGRAMS.md) for flows

### For Bug Reports

Include:
1. Which endpoint used (`/api/auth/login` or `/api/internal/login`)
2. Error message received
3. User's `internal_role` value in database
4. Steps to reproduce

---

## ✨ Key Takeaways

1. **Two endpoints, two user types** - no mixing
2. **Role determined by `internal_role` field** - NULL for admin, set for internal
3. **Generic error messages** - security feature, not a bug
4. **30-day token expiration** - intentional design
5. **Rate limiting** - prevents brute force
6. **Backward compatible** - old endpoint still works

---

## 🚀 What's Next?

- **Phase 1** ✅ Role-based login separation
- **Phase 2** 🗺️ Multi-factor authentication
- **Phase 3** 🗺️ OAuth/OpenID Connect
- **Phase 4** 🗺️ Token refresh mechanism
- **Phase 5** 🗺️ Enterprise SSO (SAML/LDAP)

---

**Last Updated**: April 13, 2026  
**Status**: Production Ready  
**Version**: 1.0

