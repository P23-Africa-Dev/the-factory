# API Integration Gaps Audit — Unimplemented & Partially Integrated Endpoints

This document provides a comprehensive audit of all backend API endpoints defined in the Laravel v1 codebase (`backend/src/routes/api.php`) compared to their current integration state in the Next.js React frontend.

---

## 1. CRM Lead Details, Notes, & Activities (High Priority)

The backend provides unified, rich endpoints for managing lead details, notes, and activities. However, the frontend detail views currently rely on static mockup files.

| Backend Route | Controller & Method | Frontend Helper / Hook | Integration Status & Findings |
|---|---|---|---|
| `GET /crm/leads/{lead}` | `LeadController@show` | `getLead` / `useLead` | **Unintegrated**: Frontend pages (`app/(dashboard)/crm/leads/[id]/page.tsx` and `app/agent/crm/leads/[id]/page.tsx`) are entirely mockup-driven, reading from `const MOCK_LEAD`. The real detail-fetching hook is never imported or called. |
| `POST /crm/leads/{lead}/notes` | `LeadController@storeNote` | `addLeadNote` / `useAddLeadNote` | **Unintegrated**: Although helper and mutation hooks exist, there is no form or UI element on the lead details page to submit new notes. |
| `POST /crm/leads/{lead}/activities` | `LeadController@storeActivity` | `addLeadActivity` / `useAddLeadActivity` | **Unintegrated**: There is no UI flow to log timeline activities for a lead; the activity log on the lead details page is completely static. |
| `PATCH /crm/leads/{lead}` | `LeadController@update` | `updateLead` / `useUpdateLead` | **Partially Integrated**: Integrated only on the Kanban board (for card editing and status updates during drag-and-drop), but not connected to any fields or actions on the Lead Details screen. |

---

## 2. Workforce Summary & Analytics (Medium Priority)

The workforce summary endpoint aggregates location activity and workload metrics, but is currently unused.

| Backend Route | Controller & Method | Frontend Helper / Hook | Integration Status & Findings |
|---|---|---|---|
| `GET /workforce/summary` | `WorkforceSummaryController` | `getWorkforceSummary` / `useWorkforceSummary` | **Unintegrated**: The hook `useWorkforceSummary` is defined in `hooks/use-dashboard.ts` but is never imported or rendered. There is no dashboard widget or page showing active agents count, task distributions, location pings in the last 30 minutes, or top agent workloads. |

---

## 3. Operations & User Management (Medium Priority)

| Backend Route | Controller & Method | Frontend Helper / Hook | Integration Status & Findings |
|---|---|---|---|
| `PATCH /internal-users/{user}/supervisor` | `InternalUserController@assignSupervisor` | `assignInternalUserSupervisor` | **Unintegrated**: Defined in `lib/api/internal-users.ts` but has no corresponding React Query hook in `hooks/use-internal-users.ts`. There is no button or select dropdown in the Agent Profile or Operations table to change or assign supervisors. |
| `GET /agents/{user}/location` | `AgentLocationController@show` | None | **Unintegrated**: No frontend API client method or hook wrapper exists. The map and list views can only query the complete locations snapshot array (`GET /agents/locations`), but cannot fetch the latest point for a single specific agent. |

---

## 4. Secure Task Proof Download (Low Priority)

| Backend Route | Controller & Method | Frontend Helper / Hook | Integration Status & Findings |
|---|---|---|---|
| `GET /tasks/{task}/proofs/{proof}` | `TaskProofController@show` | `downloadTaskProof` | **Partially Integrated**: The secure downloading proxy method is defined in `lib/api/tasks.ts` but not wrapped as a query/hook. The UI in `task-detail-modal.tsx` bypasses it by pointing a standard link `<a href={proof.file_url}>` to the raw file, which will fail if the resource requires authorization headers or is stored in a private bucket. |

---

## 5. First-Time Setup & Onboarding (Low Priority)

| Backend Route | Controller & Method | Frontend Helper / Hook | Integration Status & Findings |
|---|---|---|---|
| `POST /enterprise/onboarding/verify-company-id` | `VerifyCompanyIdController` | None | **Not Applicable / Unintegrated**: Not defined in `lib/api/enterprise.ts` or used on the setup page. Since the setup page obtains the `company_id` directly from `setup-info` and displays it as read-only, explicit separate validation is not required by the current frontend flow. |
| `POST /agent/tasks/self` | `AgentTaskController@storeSelf` | `createSelfTask` / `useCreateSelfTask` | **Unintegrated**: The mutation hook is defined in `hooks/use-tasks.ts`, but there is no UI button or creation flow on the agent portal allowing field agents to create tasks for themselves. |
