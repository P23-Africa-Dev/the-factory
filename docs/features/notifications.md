# Notifications (Backend)

## Scope
This implementation is backend-only and covers:
- in-app notifications for bell UX support (list, unread count, mark read/unread, mark all read, history, delete)
- push notification subscriptions and delivery lifecycle
- per-user notification preferences with optional company context
- realtime unread count + created events via Redis pub/sub
- domain trigger integration across task, tracking, project, payroll, CRM, auth, onboarding, workforce, and enterprise flows
- scheduled reminders for due soon/overdue tasks and near-deadline projects

## Data Model
- app_notifications
- notification_preferences
- push_subscriptions

### app_notifications
Key fields:
- user_id, company_id
- type, category, priority
- title, message
- reference_type, reference_id
- action_url, action_route
- metadata (json)
- delivery_types (json)
- is_in_app_visible, is_read, read_at
- dedupe_key (unique when present)

### notification_preferences
Key fields:
- user_id, company_id (nullable for global)
- category (supports all + specific categories)
- is_enabled, in_app_enabled, push_enabled, email_enabled
- muted_until, quiet_hours, digest_mode

### push_subscriptions
Key fields:
- user_id, company_id (nullable)
- provider, platform, device_token
- endpoint, subscription_payload
- is_active, failed_attempts, last_failure_reason, last_failed_at, last_seen_at

## API Contracts
Authenticated routes under /api/v1/notifications:
- GET /notifications
- GET /notifications/history
- GET /notifications/unread-count
- PATCH /notifications/read
- PATCH /notifications/unread
- PATCH /notifications/read-all
- DELETE /notifications/{notification}
- GET /notifications/preferences
- PUT /notifications/preferences
- GET /notifications/push-subscriptions
- POST /notifications/push-subscriptions
- POST /notifications/push-subscriptions/refresh
- DELETE /notifications/push-subscriptions

### Security
- endpoints are Sanctum-protected
- notification ownership enforced by user_id
- company-scoped operations validate membership in company_users
- cross-company access is rejected

## Realtime
Redis channel pattern:
- factory23.notifications.user.{userId}

Event payload envelope:
- event
- version
- user_id
- occurred_at
- data

Core events:
- notifications.created
- notifications.unread_count.updated

## Push Delivery
- provider abstraction via PushProvider contract
- providers:
  - log (safe default)
  - fcm (legacy FCM endpoint)
- queued dispatch via DeliverPushNotificationJob
- retries/backoff configured in job
- subscription health tracking + auto-deactivation after repeated failures

## Trigger Matrix (Current)
- Auth: registration OTP sent, email verified, password reset OTP sent, password reset completed
- Onboarding: workspace completed, enterprise activation sent/completed
- Workforce: internal invite sent/resent, supervisor assigned, internal onboarding completed
- Task: assigned/reassigned, status changed, proof uploaded, reassignment requested/accepted/rejected
- Tracking: started, near destination, arrived, completed
- Project: created, updated
- Payroll: settings created/updated
- CRM: lead created/updated, note added, activity added

## Scheduled Notifications
Command:
- php artisan notifications:dispatch-scheduled

Scheduled in routes/console.php every 15 minutes.

Dispatches:
- task.due_soon
- task.self_due_soon
- task.overdue
- project.deadline_near

## Configuration
- config/notifications.php
  - redis_channel_prefix
  - push.provider
  - push.max_failed_attempts_before_deactivate
  - scheduling.due_soon_threshold_minutes
- config/services.php
  - services.fcm.server_key
  - services.fcm.legacy_send_endpoint

## Operational Notes
- default push provider is log for safe rollout
- set NOTIFICATIONS_PUSH_PROVIDER=fcm and FCM_SERVER_KEY in production to enable real push
- run migrations before enabling API/dispatch
- ensure queue workers run notifications-push queue
