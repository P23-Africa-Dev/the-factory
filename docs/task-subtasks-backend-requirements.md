# Task Subtasks, Due Dates and Comment Counts: Backend Requirements

Prepared for the Backend engineer. Date: 11 Nov 2026. Branch: `project-upgrade`.

This document describes the API and database work needed so that the task board upgrades shipped on the frontend (web dashboard and the agent PWA) stop running on local mock data and persist through the API. It is Phase 2 of the change request "Subtasks & Due Dates on the Task Board" (10 Nov 2026).

## 1. Summary

The frontend now lets a task carry a checklist of subtasks. Each subtask has its own title, assignee and due date and time, can be ticked by its assignee or by the task creator, and drives the parent task's status automatically. Task cards also show a comment count and a due date with time. None of this is persisted today: the web board and the PWA hold the checklist in component or Zustand state and reset on reload.

The backend needs to:

1. Add a `task_subtasks` table and expose subtasks on every task payload.
2. Accept subtasks when a task is created, and add endpoints to add, edit, tick, reorder and delete them afterwards.
3. Move the parent task's status automatically when subtasks are ticked, using the existing transition and timestamp logic.
4. Return `comments_count` on task list and detail payloads.
5. Enforce the permission and validation rules listed below so the UI's client-side checks have a server-side counterpart.

No existing endpoint changes its response shape in a breaking way. All new fields are additive.

## 2. Commits covered

| Commit | What it introduced |
| --- | --- |
| `d0d83cdb` feat: add project checklist and subtask management to tasks view | Subtasks on the Create Task form, task card, task detail modal and board on `/projects`. Local mock data behind the `USE_MOCK_SUBTASKS` flag. |
| `2159a6bc` feat: add project checklist support and agent view for tasks | Same features on `/agent/projects` (assignee view) and on the PWA agent and manager task screens. Comment count and creator id parsed from task payloads. |
| `7680e704` refactor: optimize React state updates and remove redundant effects | Frontend-only clean-up. No API impact. |

Key frontend files for reference:

- Web: `lib/tasks/project-checklist.ts` (types, status rule, mock data), `components/operations/project-checklist.tsx`, `components/operations/create-task-modal.tsx`, `components/operations/task-card.tsx`, `components/operations/task-detail-modal.tsx`, `components/operations/all-projects-tasks-view.tsx`.
- PWA: `the-factory-agent-pwa/src/features/tasks/components/ProjectChecklist.tsx`, `the-factory-agent-pwa/src/features/tasks/schema.ts`, `the-factory-agent-pwa/src/manager/features/tasks/schema.ts`, `the-factory-agent-pwa/app/manager/tasks/page.tsx`.
- Backend touch points: `backend/src/app/Services/Task/TaskService.php`, `backend/src/app/Http/Resources/TaskResource.php`, `backend/src/app/Http/Requests/Task/CreateTaskRequest.php`, `backend/src/app/Http/Requests/Task/UpdateTaskRequest.php`, `backend/src/routes/api.php`.

## 3. What the frontend does today versus what the API supports

| Frontend behaviour (shipped) | API today | Gap |
| --- | --- | --- |
| Create Task form takes a main due date **with time** (`datetime-local`). | `POST /tasks` accepts `due_date` (`nullable`, `date`, `after:now`); `tasks.due_at` is a `dateTime` column. | Supported. On the checklist-enabled board the web form currently **does not send** `due_date` and keeps it locally. Once subtasks are accepted, the form will send `due_date` again. |
| Create Task form takes any number of subtasks, each with title, assignee and optional due date and time. | Not supported. | New: `subtasks[]` on `POST /tasks` and `POST /agent/tasks/self`. |
| Task card and detail modal show a checklist with a `completed/total` badge, progress bar, per-subtask assignee and due date, overdue in red. | Task payload has no subtasks. | New: `subtasks` array and `subtasks_summary` on `TaskResource`. |
| Ticking a subtask on the card or in the modal. Allowed for the subtask assignee or the task creator. | Not supported. | New: complete and uncomplete endpoint. |
| Creator can add, edit (title, assignee, due date), reorder (drag and drop) and delete subtasks after creation. | Not supported. | New: create, update, reorder, delete endpoints, creator only. |
| First tick moves Pending to In Progress. Last tick moves to Completed. Unticking a Completed task moves it back to In Progress. | Status changes only through `PATCH /tasks/{task}/status`. Transition table already allows these moves. | New: server applies the moves itself when a subtask changes and returns the updated task. |
| Cancelled tasks: checklist is locked. | Cancelled is already a locked terminal status for status updates. | Apply the same lock to all subtask endpoints. |
| Task card shows a comment count. | Comments exist (`task_comments`), but no count is returned on list or detail. | New: `comments_count` on `TaskResource`. |
| Editing a task's due date is blocked if any subtask is due later. | `PATCH /tasks/{task}` accepts `due_date` with no cross-check. | New validation rule. |
| Subtask assignee defaults to the main task assignee and can be any user from `GET /tasks/assignees`. | `GET /tasks/assignees` exists. | Validation: assignee must be a company member. See open question 2 on visibility. |
| PWA manager Projects tab shows `completed/total tasks` and a progress bar per project. | `ProjectResource` returns `task_summary.total_tasks` and `task_summary.completed_tasks`. | No API change. The PWA currently reads `tasks_count` and `completed_tasks_count`, which the API does not send. Frontend will map `task_summary` in Phase 3. Listed here so nobody adds duplicate fields. |

## 4. Data model

### 4.1 New table: `task_subtasks`

```php
Schema::create('task_subtasks', function (Blueprint $table): void {
    $table->id();
    $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
    $table->foreignId('task_id')->constrained('tasks')->cascadeOnDelete();
    $table->foreignId('assigned_user_id')->nullable()->constrained('users')->nullOnDelete();
    $table->foreignId('created_by_user_id')->constrained('users')->cascadeOnDelete();
    $table->foreignId('completed_by_user_id')->nullable()->constrained('users')->nullOnDelete();

    $table->string('title', 255);
    $table->dateTime('due_at')->nullable();
    $table->unsignedInteger('position')->default(0);
    $table->boolean('is_completed')->default(false);
    $table->timestamp('completed_at')->nullable();
    $table->timestamps();

    $table->index(['task_id', 'position']);
    $table->index(['company_id', 'assigned_user_id', 'is_completed']);
});
```

Notes:

- `position` is a zero-based order within the task. The frontend reorders by drag and drop and sends the full ordered list of ids.
- `company_id` is denormalised, matching `task_comments`, so scoping queries do not need a join.
- Deleting a task cascades to its subtasks. Deleting a user nulls the assignee rather than deleting the subtask.
- The `tasks` table needs no new columns. `due_at` already exists and already stores time.

### 4.2 Model

Add `App\Models\TaskSubtask` with `task()`, `assignee()`, `creator()`, `completer()` relations, and add `subtasks(): HasMany` on `Task` ordered by `position`, `id`.

Consider a `TaskSubtaskObserver` or service hook so that any change to `is_completed` recomputes the parent status (section 6).

## 5. Payload shapes

Field names follow the existing API convention (snake_case, ISO 8601 timestamps). The frontend maps these to its internal camelCase types.

### 5.1 Subtask object

```json
{
  "id": 501,
  "task_id": 120,
  "title": "Draft the handoff summary",
  "position": 1,
  "due_at": "2026-11-14T17:00:00+00:00",
  "is_completed": false,
  "completed_at": null,
  "assignee": { "id": 42, "name": "Ada Okoro", "email": "ada@example.com", "avatar_url": null },
  "completed_by": null,
  "created_at": "2026-11-10T09:12:00+00:00",
  "updated_at": "2026-11-10T09:12:00+00:00"
}
```

`assignee` may be `null` if the assigned user was deleted. The frontend falls back to the task assignee's name in that case.

### 5.2 Additions to `TaskResource`

Add these keys to every task payload returned by `GET /tasks`, `GET /tasks/{task}`, `POST /tasks`, `PATCH /tasks/{task}`, `PATCH /tasks/{task}/status`, `PATCH /tasks/{task}/assign` and the agent equivalents:

```json
{
  "due_date": "2026-11-15T17:00:00+00:00",
  "comments_count": 3,
  "subtasks_summary": { "total": 4, "completed": 1 },
  "subtasks": [ { "...": "subtask objects, ordered by position" } ]
}
```

- `subtasks` is always present, an empty array when there are none. The UI renders the card exactly as before when the array is empty.
- `subtasks_summary` lets the list stay cheap if you later decide to omit the full array on list responses. For Phase 2 include the full array on the list as well, because the board ticks subtasks directly on cards without opening the detail.
- `comments_count` is a `withCount('comments')` on list and detail queries. The web board shows it on the card; the PWA shows it on the compact card.
- For agent requesters, `TaskResource` currently hides other assignees. Do **not** hide subtask assignees. The card shows every subtask with its assignee's name so the agent knows which items are theirs.

## 6. Business rules

### 6.1 Permissions

Let `creator` mean `tasks.created_by_user_id === auth user`, and `manager` mean the roles returned true by `TaskAccessContext::canManageTasks()` (owner, admin, supervisor today).

| Action | Who | Notes |
| --- | --- | --- |
| View subtasks | Anyone who can view the task | Same scoping as `TaskService::listForUser` and `findForUser`. |
| Add, edit, reorder, delete a subtask | Task creator only | This is the product decision from 10 Nov 2026. See open question 1 on whether owner and admin should also be allowed. |
| Complete or uncomplete a subtask | The subtask's assignee, or the task creator | Managers who are neither get `403`. |
| Anything on a cancelled task | Nobody | Return `422` with `status: ["Terminal tasks cannot be changed."]`, same message as today. |
| Subtasks on create | Whoever may create the task | `POST /tasks` is manager only; `POST /agent/tasks/self` is agent only. The agent self-task flow should accept subtasks too, with the agent as the only allowed assignee. |

### 6.2 Validation

| Field | Rule |
| --- | --- |
| `title` | required, string, min 1 after trim, max 255 |
| `assigned_user_id` | required on create, integer, must be a member of the task's company (reuse `ensureAssigneeBelongsToCompany`). Defaults to the task's primary assignee when omitted on nested create. |
| `due_at` | nullable, ISO 8601 date-time. If the task has `due_at`, the subtask `due_at` must be `<=` the task `due_at`. Do not apply `after:now` to subtasks; a creator may back-fill an overdue item. |
| `position` | not accepted on create or update. Use the reorder endpoint. |
| `is_completed` | boolean, only on the complete endpoint. |
| Task `due_date` on `PATCH /tasks/{task}` | if any subtask has `due_at` later than the new value, reject with `422` and `due_date: ["The task due date cannot be earlier than a subtask due date."]`. The create form uses the same wording. |
| Nested `subtasks` on task create | array, max 50 items, each item validated as above. Every subtask `due_at` must be `<=` the task `due_date` when one is given. |
| Reorder payload | `subtask_ids` must contain every subtask id of the task exactly once. |

Error payloads use the existing envelope (`success: false`, `message`, `errors`).

### 6.3 Automatic status transitions

Apply these after every change that alters the set of completed subtasks (complete, uncomplete, delete, nested create with pre-completed items is not allowed, so create never triggers a move). Run inside the same database transaction as the subtask write.

Let `total` be the number of subtasks after the change and `done` the number completed.

| Current task status | Condition | New status |
| --- | --- | --- |
| `pending` | `done >= 1` and `done < total` | `in_progress` |
| `pending` | `done == total` and `total > 0` | `completed` (pass through `in_progress`, so `started_at` and `completed_at` are both set) |
| `in_progress`, `paused`, `resumed` | `done == total` and `total > 0` | `completed` |
| `completed` | `done < total` | `in_progress` |
| `cancelled` | any | no change, and the request is rejected earlier |
| any | `total == 0` (last subtask deleted) | no change. Tasks without subtasks keep the manual flow. |

Implementation notes:

- Reuse `buildStatusUpdatePayload` so `started_at`, `paused_at`, `resumed_at`, `completed_at` and `last_status_updated_by_user_id` are set the same way as a manual status change. The acting user is the person who ticked the box.
- Bypass `assertValidStatusTransition` for the internal `pending -> completed` case by applying two steps, or add the automatic path as its own private method. Every other move in the table above is already an allowed transition.
- Call `notifyTaskStatusChanged` for automatic moves so managers get the same notifications as for manual ones.
- Completion requirements: `updateStatus` currently refuses `completed` when `minimum_photos_required` is not met or a GPS proof is missing. The frontend auto-completes regardless. Recommended server behaviour: if the task has such requirements and they are not met, move the task to `in_progress` instead of `completed`, keep the subtask ticked, and return `"completion_blocked_reason": "Minimum 2 proof image(s) required before completion."` on the response. The frontend will show that as a toast. See open question 3.
- The response to every subtask write is the full updated task (`{ "task": TaskResource }`), plus `"status_changed": true|false` and the optional `completion_blocked_reason`. The UI uses the returned task to update the card, the column counts and the modal in one step.

### 6.4 Interaction with existing task actions

- **Reassigning the task** (`PATCH /tasks/{task}/assign`): existing subtasks keep their own assignee. Do not rewrite them. The frontend defaults only new subtasks to the current task assignee.
- **Manual status change** (`PATCH /tasks/{task}/status`): keep working exactly as today. Do not touch subtasks. A manager dragging a task to Completed with unticked subtasks is allowed; the board shows `1/4` on a Completed card in that case.
- **Cancel**: locks the checklist. Reopening is not possible today, so nothing to add.
- **Delete task**: cascades.
- **Comments**: unchanged. Only the count is new.

## 7. Endpoints

All routes sit under the existing `tasks` groups. There are three groups in `routes/api.php`: the management group (around line 442), the agent group (around line 832) and the shared group (around line 1064). Register the subtask routes in the same three places, next to the comments routes, so the web dashboard, `/agent/projects` and the PWA all reach them with the prefixes they already use.

Authentication, `company_id` resolution and company scoping follow the comments endpoints.

### 7.1 Create a task with subtasks

`POST /tasks` and `POST /agent/tasks/self`

Add an optional `subtasks` array to the existing body:

```json
{
  "company_id": 7,
  "project_id": 12,
  "title": "Prepare account handoff",
  "description": "Hand the account over to the field team with notes.",
  "assigned_agent_id": 42,
  "due_date": "2026-11-15T17:00:00Z",
  "subtasks": [
    { "title": "Review the account notes", "assigned_user_id": 42, "due_at": "2026-11-13T12:00:00Z" },
    { "title": "Draft the handoff summary", "assigned_user_id": 57, "due_at": null },
    { "title": "Share the handoff" }
  ]
}
```

- Subtasks are created in array order with `position` 0, 1, 2.
- `assigned_user_id` defaults to the task's primary assignee. For self-tasks it must equal the authenticated agent.
- Response is the existing `201 { "task": TaskResource }`, now including `subtasks`.

### 7.2 List subtasks

Not needed as a separate call. They come with the task. If you prefer a dedicated `GET /tasks/{task}/subtasks` for future pagination, mirror the comments shape `{ "items": [...] }`.

### 7.3 Add a subtask

`POST /tasks/{task}/subtasks`

```json
{ "company_id": 7, "title": "Confirm next steps", "assigned_user_id": 42, "due_at": "2026-11-14T10:00:00Z" }
```

- Creator only. Appended at the end (`position = max + 1`).
- `201 { "task": TaskResource, "subtask": Subtask, "status_changed": false }`.

### 7.4 Edit a subtask

`PATCH /tasks/{task}/subtasks/{subtask}`

```json
{ "company_id": 7, "title": "Confirm next steps with the client", "assigned_user_id": 57, "due_at": null }
```

- Creator only. Any subset of `title`, `assigned_user_id`, `due_at`.
- `200 { "task": TaskResource, "subtask": Subtask, "status_changed": false }`.

### 7.5 Complete or uncomplete a subtask

`PATCH /tasks/{task}/subtasks/{subtask}/complete`

```json
{ "company_id": 7, "is_completed": true }
```

- Subtask assignee or task creator.
- Sets `completed_at` and `completed_by_user_id` when completing, clears both when uncompleting.
- Applies the automatic status rules in 6.3.
- `200 { "task": TaskResource, "subtask": Subtask, "status_changed": true, "completion_blocked_reason": null }`.

A plain boolean body was chosen over separate complete and uncomplete routes so the UI's single checkbox handler maps to one call.

### 7.6 Reorder subtasks

`PATCH /tasks/{task}/subtasks/reorder`

```json
{ "company_id": 7, "subtask_ids": [503, 501, 502, 504] }
```

- Creator only. Rewrites `position` to match array order.
- `200 { "task": TaskResource }`.

Register this route before `/{subtask}` so `reorder` is not captured as an id.

### 7.7 Delete a subtask

`DELETE /tasks/{task}/subtasks/{subtask}?company_id=7`

- Creator only. Re-packs positions of the remaining subtasks.
- Applies the automatic status rules in 6.3, because deleting the only unticked item can complete the task.
- `200 { "task": TaskResource, "deleted_subtask_id": 502, "status_changed": false }`.

### 7.8 Changes to existing endpoints

| Endpoint | Change |
| --- | --- |
| `GET /tasks`, `GET /agent/tasks` | Eager load `subtasks.assignee`, add `withCount('comments')`. Return `subtasks`, `subtasks_summary`, `comments_count`. |
| `GET /tasks/{task}` | Same. |
| `PATCH /tasks/{task}` | Add the `due_date` cross-check against subtasks (6.2). |
| `PATCH /tasks/{task}/assign` | No logic change. Response now includes subtasks. |
| `PATCH /tasks/{task}/status` and `/admin/tasks/{task}/status` | No logic change. Response now includes subtasks. |

### 7.9 Status codes

| Code | When |
| --- | --- |
| `200` / `201` | Success. |
| `403` | Not the creator for add, edit, reorder, delete. Not creator or assignee for complete. |
| `404` | Task or subtask not in the resolved company, or subtask not on that task. |
| `422` | Validation failures from 6.2, cancelled task, reorder list mismatch. |

## 8. Suggested service layout

Add `App\Services\Task\TaskSubtaskService` with:

- `createMany(Task $task, User $actor, array $items): void` called from `TaskService::create` and `createSelf` inside their existing transactions.
- `add`, `update`, `setCompleted`, `reorder`, `delete`, each resolving the access context with `TaskAccessService::resolve`, calling `assertTaskIntegrityInCompany`, and checking the permission table in 6.1.
- `private function syncParentStatus(Task $task, User $actor): array` returning `['status_changed' => bool, 'completion_blocked_reason' => ?string]` and reusing `buildStatusUpdatePayload` and `notifyTaskStatusChanged` from `TaskService`. Those two are private today and will need to be made reusable.

Form requests: `StoreTaskSubtaskRequest`, `UpdateTaskSubtaskRequest`, `CompleteTaskSubtaskRequest`, `ReorderTaskSubtasksRequest`. Extend `CreateTaskRequest` and `CreateSelfTaskRequest` with the nested `subtasks` rules.

Resource: `TaskSubtaskResource`, used by `TaskResource::subtasks`.

## 9. Field mapping for the frontend integration (Phase 3)

Listed so both sides agree before the API lands. No backend action.

| API field | Web type (`ProjectSubtask`) | PWA type (`ChecklistStep`) |
| --- | --- | --- |
| `id` | `id` (string) | `id` (string) |
| `title` | `title` | `title` |
| `assignee.id` | `assigneeId` | `assigneeId` |
| `assignee.name` | `assigneeName` | `assigneeName` |
| `due_at` | `dueAt` | `dueAt` |
| `is_completed` | `isCompleted` | `done` |
| `completed_at` | `completedAt` | not shown |
| task `due_date` | `ProjectChecklist.dueAt` | `ChecklistTask.dueDate` |
| task `created_by_user_id` | `ProjectChecklist.creatorId` | `creatorId` |
| task `comments_count` | `commentCount` | `commentCount` |

On integration the frontend will remove the mock data in `lib/tasks/project-checklist.ts` (the `USE_MOCK_SUBTASKS` flag and `mockProjectTasks`), the local patch state in `all-projects-tasks-view.tsx`, and the Zustand draft store in the PWA `ProjectChecklist.tsx`, and will send `due_date` again from the checklist-enabled Create Task form.

## 10. Test coverage expected

Add to `tests/Feature/Task/TaskManagementTest.php` or a new `TaskSubtaskTest.php`:

- Create task with three subtasks: positions 0 to 2, default assignee applied, `due_at` later than the task due date rejected with `422`.
- Agent self-task with subtasks assigned to someone else is rejected.
- Non-creator (including owner, per the current decision) gets `403` on add, edit, reorder, delete.
- Subtask assignee can complete and uncomplete their own item; a different agent gets `403`; creator can complete anyone's item.
- Pending task, first tick: status `in_progress`, `started_at` set, `status_changed` true.
- Last tick: status `completed`, `completed_at` set. Untick afterwards: `in_progress`, `completed_at` null.
- Ticking the only subtask on a pending task goes straight to `completed` with both timestamps set.
- Task with `minimum_photos_required = 1` and no proofs: last tick leaves the task `in_progress` and returns `completion_blocked_reason`.
- Cancelled task: every subtask endpoint returns `422`.
- Deleting the last unticked subtask completes the task. Deleting all subtasks leaves the status unchanged.
- Reorder with a missing or extra id returns `422`.
- `PATCH /tasks/{task}` with `due_date` earlier than a subtask returns `422`.
- List and detail include `subtasks`, `subtasks_summary` and `comments_count`, and the comment count matches `task_comments`.
- Agent requester sees subtask assignees that are not themselves.

## 11. Open questions for the Backend and Product

1. **Creator-only management.** The 10 Nov decision says only the task creator can add, edit or delete subtasks. Should owner and admin also be allowed, so a checklist survives when the creator leaves the company? Recommendation: allow `canManageTasks()` roles in addition to the creator, and have the frontend keep showing the controls only to the creator for now.
2. **Visibility for subtask assignees who are not task assignees.** The form lets a subtask be assigned to any user from `GET /tasks/assignees`. If that user is not a current assignee of the task, `listForUser` will not return the task to them, so they cannot tick their item. Options: (a) restrict subtask assignees to current task assignees, or (b) extend the agent list scope to include tasks where the user has a subtask. Recommendation: (b), with the task shown read-only apart from their own subtasks.
3. **Auto-complete versus proof requirements.** Section 6.3 proposes stopping at `in_progress` with a `completion_blocked_reason` when photo or GPS requirements are unmet. Confirm this is acceptable, or decide that auto-complete should bypass proof requirements for tasks that have subtasks.
4. **Subtask notifications.** Should a user be notified when a subtask is assigned to them, when their subtask becomes overdue, or when the task auto-completes? Reminders were explicitly out of scope for Phase 1; confirm whether an in-app notification on assignment is wanted now.
5. **Agent self-tasks.** Confirm that `POST /agent/tasks/self` should accept subtasks in Phase 2, or whether that can wait for Phase 4 (agent and admin views).

## 12. Acceptance checklist for Phase 2

- [ ] Migration for `task_subtasks` applied, model and relations in place.
- [ ] `POST /tasks` accepts `subtasks[]` and returns them in order.
- [ ] Add, edit, complete, reorder and delete endpoints live in all three route groups.
- [ ] `TaskResource` returns `subtasks`, `subtasks_summary` and `comments_count` on list and detail.
- [ ] Automatic status moves follow section 6.3 and set the same timestamps as manual moves.
- [ ] Cancelled tasks reject every subtask write.
- [ ] Creator-only and assignee-or-creator permissions enforced server-side.
- [ ] Task `due_date` edits are checked against subtask due dates.
- [ ] Postman or OpenAPI entries under `backend/openapi` and `backend/postman` updated.
- [ ] `api-docs/features/task-management.md` updated with the new endpoints and data model.
- [ ] Feature tests from section 10 pass.
