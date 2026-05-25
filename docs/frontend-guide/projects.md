# Projects Frontend Guide

## Purpose

Projects All Projects keeps the existing UI and now uses live backend analytics for:

- Project Performance card
- Agents Who Have Not Commenced Tasks card
- View All navigation with not-commenced filtering

## Data Source

Hook:

- `useProjects({ company_id, page }, basePath)`

Base path:

- management: default (`/admin/projects` through API request abstraction)
- agent: `/agent`

The hook now returns:

- `projects`
- `pagination`
- `analytics`

## Project Performance Wiring

Component:

- `components/operations/projects-view.tsx`
- `components/operations/projects-view-agents.tsx`

Uses:

- `analytics.project_performance.project_progress` for center percentage
- `analytics.project_performance.status` for status label

Fallback behavior:

- if analytics is missing, it falls back to computed local project completion percent.

## Non-Commenced Agents Wiring

Component:

- `components/operations/projects-view.tsx` (management card)

Uses:

- `analytics.non_commenced_agents.percentage` for curved progress percentage

Fallback behavior:

- if analytics is missing, it falls back to previous pending ratio logic.

## View All Navigation

From the not-commenced agents card:

- button route: `/tasks?status=not_commenced`

Route:

- `app/(dashboard)/tasks/page.tsx`

The page renders the existing `AllTasksView` with no layout redesign.

## Not-Commenced Filter Behavior

Component:

- `components/operations/all-tasks-view.tsx`

When query `status=not_commenced` is present:

- requests pending tasks (`status=pending`) from API
- applies strict client filter:
  - assigned task only
  - `status === pending`
  - `started_at` is null
- default selected status chip is `Pending`

This ensures the list excludes started/in-progress/completed tasks.

## Role Behavior

Management:

- sees org-level analytics and org task filtering results (within company context)

Agent:

- sees own scoped analytics and assignment-scoped task visibility

## Validation Checklist

- Project Performance percent matches backend `project_progress`
- Project Performance status matches backend status band
- Not-commenced card percent matches backend `non_commenced_agents.percentage`
- View All opens `/tasks?status=not_commenced`
- `/tasks` page shows only assigned, pending, unstarted tasks
- company context and role visibility remain isolated
