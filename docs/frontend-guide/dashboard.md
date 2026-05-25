# Dashboard Frontend Guide

## Purpose

The dashboard page keeps the existing visual layout and now consumes real backend data for:

- My Activity percentage and trend direction
- Ongoing Task progress block
- View All Task navigation
- View CRM Pipeline navigation

## Data Source

Hook:

- useDashboardOverview({ company_id, basePath })

Base path:

- management roles: /admin
- agent role: /agent

## My Activity Wiring

Component:

- components/dashboard/dashboard-charts.tsx (MyActivitiesChart)

Uses:

- overview.activity_metric.activity_score
- overview.activity_metric.direction
- overview.activity_metric.current_week_daily

Behavior:

- percentage text is live score
- positive score renders with + prefix
- direction down rotates arrow downward and changes arrow color to red
- direction up/flat preserves existing style
- area chart points are fed from current_week_daily (fallback to existing static data if payload missing)

## Ongoing Task Wiring

Component:

- components/dashboard/dashboard-cards.tsx (WeeklyTasksAgents)

Uses:

- overview.ongoing_tasks[0] for current active preview in existing card UI

Displayed fields:

- agent avatar, or initials fallback
- agent name snippet
- task progress percent
- active status from backend payload

Progress bar:

- width style is set from progress_percent
- value is clamped 0..100 on the frontend

If no active task:

- progress shows 0
- label shows No Active Task

## Navigation Wiring

View All Task button:

- management -> /tasks
- agent -> /agent/tasks

CRM Pipeline card click:

- management -> /crm
- agent -> /agent/crm

## Role Behavior

Dashboard payload is role-aware from backend:

- management sees org-wide activity and ongoing tracking
- agent sees self-scoped activity and assigned tracking only

No frontend role override is used beyond choosing basePath and destination routes.

## Validation Checklist

- weekly activity increase/decrease reflected in score and arrow direction
- down trend arrow is red
- active task appears when task status is in_progress and tracking session is active
- progress updates from backend tracking computations
- completed tasks are excluded from ongoing list
- View All Task navigates per role
- CRM card navigates per role
