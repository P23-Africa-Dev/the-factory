# Health API Frontend Guide

## Feature Overview
Use this endpoint to confirm backend availability before loading authenticated screens or running startup data fetches.

## User Flow
1. App boots.
2. Frontend calls GET /api/v1/health.
3. If response is healthy, continue app initialization.
4. If request fails, show maintenance/offline state.

## API Endpoints
- GET /api/v1/health
- Auth: none

## Request Examples
### Fetch
```javascript
const response = await fetch('/api/v1/health', {
  headers: { Accept: 'application/json' },
});
const payload = await response.json();
```

## Response Examples
### Success 200
```json
{
  "success": true,
  "message": "API is healthy",
  "data": {
    "service": "Factory API",
    "environment": "local",
    "timestamp": "2026-04-03T12:00:00+00:00"
  },
  "errors": null
}
```

### Error 500
```json
{
  "success": false,
  "message": "Server error",
  "data": null,
  "errors": {
    "server": ["An unexpected error occurred."]
  }
}
```

## Error Handling
- Network error: show offline banner and retry button.
- 500: show temporary service issue screen.
- Timeout: retry with backoff.

## Frontend Integration Example (Axios/fetch)
```javascript
export async function checkApiHealth() {
  const res = await fetch('/api/v1/health', {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }

  const body = await res.json();
  if (!body?.success) {
    throw new Error(body?.message || 'Health check failed');
  }

  return body.data;
}
```

## Notes & Edge Cases
- This is a liveness check, not full business-readiness.
- Useful for monitoring and frontend environment diagnostics.
- Cache very briefly or do on-demand to avoid stale status.
