# Payroll Frontend Guide

## Purpose

The payroll UI is wired to live payroll API data while preserving the existing dashboard layout, spacing, and card structure. The frontend now consumes payroll settings, payroll overview metrics, agent payroll lists, agent profile details, and agent payroll updates.

## Data Sources

### Hooks

- `usePayroll(companyId)` for company payroll settings
- `usePayrollOverview({ company_id })` for dashboard summary values
- `usePayrollAgents(params)` for the payroll agent list
- `usePayrollAgentProfile(userId, params)` for the selected agent profile and history
- `useUpdateAgentPayroll(userId)` for agent payroll edits

### API Wrapper

- `lib/api/payroll.ts` provides the typed fetch helpers and UI mappers.

## Key UI Components

- `components/payroll/payment-overview.tsx`
- `components/payroll/payroll-list.tsx`
- `components/payroll/payroll-sidebar.tsx`
- `components/payroll/payroll-history.tsx`
- `components/payroll/edit-agent-payroll-modal.tsx`
- `components/payroll/set-payroll-modal.tsx`

## Page Wiring

### Dashboard Payroll Page

- Fetches payroll overview metrics for the active company.
- Fetches payroll agents for the current company and selected filters.
- Uses the selected agent profile to populate the sidebar.
- Opens the edit modal from the sidebar customize action.

### Payroll List Pages

- Use the same payroll agent query and profile query pattern.
- Keep the existing list card layout and sidebar presentation.
- Use the live history entries returned from the profile endpoint.

### Agent Payroll Page

- Uses the same live overview and profile data.
- Remains read-only by not passing an edit callback into the sidebar.
- Still shows the selected profile and payroll history.

## Search And Filter Behavior

- The search input is wired directly to the payroll agents query.
- The filter button cycles through `all`, `approved`, and `pending` states without changing the current layout.
- The backend applies company scoping and role scoping, so agents only see their own profile data.

## Edit Flow

- The edit modal edits `base_salary`, `salary_type`, `attendance_affects_pay`, and `work_days_override`.
- After a successful update, the payroll queries are invalidated and the sidebar refreshes from live data.

## Design Constraint

- The UI structure is intentionally unchanged.
- The wiring only replaces mock/static payloads with live data and actions.
