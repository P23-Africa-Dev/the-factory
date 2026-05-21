# Notifications Frontend Integration Guide

## Overview
Frontend must consume backend APIs only. No direct database or queue coupling.

## Bell UX Flow
1. On app shell load:
- call GET /api/v1/notifications/unread-count
- call GET /api/v1/notifications?per_page=20

2. On bell panel open:
- refresh GET /api/v1/notifications

3. On item click:
- navigate using action_url or action_route
- call PATCH /api/v1/notifications/read with notification_ids

4. On mark all read:
- call PATCH /api/v1/notifications/read-all

5. On history screen:
- call GET /api/v1/notifications/history with filters + pagination

## API Usage Patterns
### List
GET /api/v1/notifications?company_id=123&is_read=0&category=task&per_page=20

### Mark Read
PATCH /api/v1/notifications/read
{
  "company_id": 123,
  "notification_ids": [101, 102]
}

### Preferences
PUT /api/v1/notifications/preferences
{
  "company_id": 123,
  "preferences": [
    {
      "category": "task",
      "is_enabled": true,
      "in_app_enabled": true,
      "push_enabled": true,
      "email_enabled": false,
      "muted_until": null,
      "quiet_hours": null,
      "digest_mode": null
    }
  ]
}

### Push Subscription Register/Refresh
POST /api/v1/notifications/push-subscriptions
{
  "company_id": 123,
  "provider": "fcm",
  "platform": "web",
  "device_token": "<token>",
  "endpoint": "<endpoint>",
  "subscription_payload": {"keys": {}},
  "user_agent": "<ua>",
  "is_active": true
}

DELETE /api/v1/notifications/push-subscriptions
{
  "company_id": 123,
  "device_token": "<token>"
}

## Realtime Integration
Subscribe websocket/realtime bridge to Redis-proxied user channel:
- factory23.notifications.user.{authUserId}

Handle events:
- notifications.created
- notifications.unread_count.updated

Recommended client behavior:
- on notifications.created: prepend item if bell panel active
- on notifications.unread_count.updated: hard set badge count from payload

## Badge Consistency Strategy
- always trust unread_count from API/realtime
- avoid local increment/decrement heuristics as source of truth
- on reconnect, refetch unread count and first page list

## Deep Link Handling
Each notification may include:
- action_url
- action_route
- reference_type/reference_id

Priority resolution:
1. action_url
2. mapped action_route
3. fallback by reference_type/reference_id

## Error Handling
- 422 for invalid payloads or company context mismatch
- 401 when token expired; redirect to login
- 403/404 should show non-blocking toast and remove stale item if needed

## Pagination
List endpoints return simple pagination links:
- next_page_url
- prev_page_url
- per_page

Use cursor-like next_page_url iteration for infinite scroll.

## Migration Rollout Checklist
- ship notification bell with unread badge
- ship preferences panel
- ship push permission + token registration
- verify realtime updates in multi-tab scenarios
- test company context switching with company_id
