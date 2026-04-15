# Enterprise Onboarding Frontend Guide

## Feature Overview
Enterprise onboarding is an admin-controlled process from demo request through activation and subsequent login.

## User Flow
1. Prospect submits demo request form.
2. User receives confirmation email.
3. Admin approves request and sends activation link.
4. User opens first-time setup link.
5. Frontend verifies company ID and token.
6. User sets password and completes setup.
7. User logs in with email and password.

## API Endpoints
- POST /api/v1/enterprise/demo-requests
- POST /api/v1/enterprise/onboarding/verify-company-id
- POST /api/v1/enterprise/onboarding/complete
- POST /api/v1/enterprise/login

## Request Examples
### Demo Request
```json
{
  "full_name": "Ada Afolabi",
  "email": "ada@acme.com",
  "company_name": "Acme Logistics",
  "country": "NG",
  "team_size": "11-50",
  "use_case": "field_operations"
}
```

### Verify Company ID
```json
{
  "request_id": 12,
  "token": "<signed-token>",
  "company_id": "FAC-12345"
}
```

### Complete Setup
```json
{
  "request_id": 12,
  "token": "<signed-token>",
  "company_id": "FAC-12345",
  "password": "StrongPass!123",
  "password_confirmation": "StrongPass!123"
}
```

## Response Examples
### Setup Complete 200
```json
{
  "success": true,
  "message": "First-time setup completed successfully.",
  "data": {
    "token": "1|...",
    "token_type": "Bearer",
    "user": {
      "email": "ada@acme.com",
      "enterprise_onboarding_completed": true
    }
  },
  "errors": null
}
```

### Token/Company Validation Error 422
```json
{
  "success": false,
  "message": "The given data was invalid.",
  "data": null,
  "errors": {
    "token": ["Token is invalid or expired."]
  }
}
```

## Error Handling
- 409 duplicate request: display existing request guidance.
- 422 invalid token/company_id: show setup link expired screen.
- 401 login before activation: redirect to first-time setup instructions.

## Frontend Integration Example (Axios/fetch)
```javascript
const API = '/api/v1/enterprise';

export async function submitDemoRequest(payload) {
  const res = await fetch(`${API}/demo-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function completeEnterpriseSetup(payload) {
  const res = await fetch(`${API}/onboarding/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await res.json();
  if (!res.ok || !body.success) throw body;

  localStorage.setItem('auth_token', body.data.token);
  return body.data;
}
```

## Notes & Edge Cases
- Setup links are signed and time-limited.
- Activation token is one-time use.
- Company ID must match approved request context.
- After setup, use normal enterprise login endpoint.
