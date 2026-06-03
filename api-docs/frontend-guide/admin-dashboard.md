# Admin Dashboard Frontend Guide

## Feature Overview
This module is a Laravel Blade-based internal panel under /admin, separate from the API-driven Next.js frontend.

## User Flow
1. Admin opens /admin/login.
2. Submits credentials through admin web form.
3. Backend creates admin session (admin guard).
4. Admin views dashboard metrics and user management pages.
5. Admin can activate/deactivate users via panel actions.

## API Endpoints
There are no public SPA API endpoints documented for this module.
This is session-based web routing under /admin.

Primary routes:
- GET /admin/login
- POST /admin/login
- GET /admin/dashboard
- POST /admin/logout
- GET /admin/users
- GET /admin/users/{user}

## Request Examples
For custom frontend integration, this module would require dedicated API contracts first.
Current implementation expects Laravel session and CSRF handling in Blade forms.

## Response Examples
- HTML responses for page routes.
- Redirect responses on authentication/authorization failures.

## Error Handling
- Unauthenticated admin access redirects to admin login.
- Inactive admins are blocked by admin.active middleware.
- Permission checks are enforced via admin.permission middleware.

## Frontend Integration Example (Axios/fetch)
```javascript
// Not recommended for current module since it is page-rendered.
// If you still perform progressive enhancement, include credentials and CSRF.

async function postWithSession(url, payload, csrfToken) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': csrfToken,
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return res;
}
```

## Notes & Edge Cases
- Keep this feature isolated from token-based SPA auth flows.
- Do not reuse API bearer token auth for /admin web pages.
- If future SPA admin APIs are added, create a separate frontend guide for those endpoints.
