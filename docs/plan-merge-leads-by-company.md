# Plan: merge leads by company after upload

## Context
The tester wants the CRM to notice, after a lead upload, that several leads belong to the same company. Example: Donald, Siro and Salim, all at P23 Africa, across two uploads. The CRM should then ask whether to merge them. Merging gives **one P23 Africa lead** whose people appear as Contact 1, 2, 3 on the lead page. That page already pages through contacts ("Contact 1 of N"), so the display part already exists.

What's missing:
- Import only spots duplicates of the *same person* (same email or phone). Its options are create / skip / update.
- The existing "merge" only fills empty fields on one lead from incoming data. Nothing combines two leads into one.
- The import result screen doesn't know which leads it created.

## Decisions (from you)
- **Same company:** names match once case, spacing and punctuation are ignored and common endings are stripped. "P23 Africa", "p23 africa" and "P23 Africa Ltd." match; "P23" and "P23 Africa" do not.
- **Scope:** a newly imported lead is grouped with **any** lead in the company account that has the same company, including leads from earlier uploads.
- **Merge rules:**
  - The **oldest** lead survives and is renamed to the company name.
  - Everything from the other leads moves onto it: contacts, notes, activities, emails, meetings and field visits.
  - Its own stage, assignee and budget are kept; empty fields are filled from the others.
  - The other leads are then deleted.
- **Who can merge:** managers can merge any group. Agents can merge only when they created, or are assigned to, **every** lead in the group.

## How it works for the user
```
 ┌ Import complete ──────────────────────────────────────────────┐
 │ ✓ 42 imported · 3 updated · 1 skipped                          │
 │                                                                │
 │ Same company, several leads                                    │
 │ ┌──────────────────────────────────────────────────────────┐   │
 │ │ P23 Africa · 3 leads                                      │   │
 │ │ Donald (new) · Siro (new) · Salim (existing, 12 Nov)      │   │
 │ │                          [ Keep separate ]  [ Merge ]     │   │
 │ ├──────────────────────────────────────────────────────────┤   │
 │ │ Acme Ltd · 2 leads                                        │   │
 │ │ Jane (new) · Paul (new)  [ Keep separate ]  [ Merge ]     │   │
 │ └──────────────────────────────────────────────────────────┘   │
 │ [ Merge all (2) ]                              [ View leads ]  │
 └────────────────────────────────────────────────────────────────┘
```
- The section appears on the import's "results" step, only when there are groups.
- Each group can be merged or kept separate on its own.
- After a merge the row reads "Merged into P23 Africa · View", which opens the lead on its contacts.
- **Keep separate** hides the group for this result. Nothing is saved, so the next upload can ask again.

On the merged lead, the contacts section shows "Contact 1 of 3": Donald, Siro, Salim.

## Backend
### 1. Company key — `App\Support\CompanyNameKey` (new)
- `key(?string): ?string` lowercases the name, turns `&` into "and", and strips punctuation and extra spaces.
- It then drops trailing endings repeatedly: ltd, limited, llc, inc, incorporated, plc, corp, corporation, co, company, gmbh, sa, bv, pty, nig, nigeria ltd…
- It returns null when nothing is left.
- Comparison happens in PHP, so no migration is needed. Candidate leads are first narrowed in SQL with `LOWER(company_name) LIKE first-word%` per group, which keeps it cheap.

### 2. Import returns the leads it created
- `LeadService::importLeads` collects the ids of created and updated leads and returns `imported_lead_ids` (capped at 5,000).
- `ImportLeadsResult` (TS) gets `imported_lead_ids?: number[]`.
- The wizard sends rows in 500-row batches, so it gathers the ids across batches.

### 3. Find groups — `POST /crm/leads/company-groups`
- **Body:** `{ company_id, lead_ids }`.
- **Logic:**
  - For each given lead with a company name, compute its key.
  - Load leads in the company account whose company name *could* match.
  - For agents, only load leads they can access (created by or assigned to them).
  - Group by key and keep groups with 2 or more leads.
- **Each group returns:**
  - `company_name` (the most common spelling) and `key`;
  - `leads[]`: id, name, primary contact, created_at, `is_new` (in `lead_ids`), status name;
  - `survivor_id` (the oldest);
  - `can_merge`.
- Groups are sorted by size, at most 50.
- Read-only. It lives in `LeadService::companyGroups` and `LeadController::companyGroups`.

### 4. Merge — `POST /crm/leads/merge-by-company`
- **Body:** `{ company_id, lead_ids }` (one group).
- **Checks:**
  - All leads are in this company and their company keys are equal.
  - At least 2 leads.
  - The permission rule above, including agent access to every lead.
- `LeadService::mergeLeadsIntoCompany` runs in **one DB transaction** with the survivor = the oldest lead (lowest `created_at`, then id).

  1. **Contacts:** add each other lead's contacts after the survivor's. Use `lead_contacts` rows, or the lead's own name/email/phone/position when it has none. Skip a contact whose email or phone already exists on the survivor. Renumber `sort_order` from 0, because there is a unique (lead_id, sort_order) index.
  2. **History:** repoint these to the survivor:
     - `lead_notes` and `lead_activities`;
     - `crm_email_threads`, `crm_email_messages` and `crm_email_activity_logs`;
     - `meeting_attendees` and `field_stops`.

     `meeting_leads` has a unique (meeting_id, lead_id) index, so insert-or-ignore for the survivor, then delete the old rows.
  3. **Map locations:** repoint `company_locations.crm_lead_id` to the survivor.
  4. **Lead fields:**
    - Name becomes the company name.
    - Email, phone, location, website, company_email, position, industry, budget, profile_urls and custom_fields are filled only where the survivor is empty.
    - Stage, priority, pipeline and assignee stay the survivor's.
    - `converted_at` is kept if any of the merged leads was converted.
  5. **Audit:** add a `lead_activities` entry on the survivor, "Merged 2 leads (Siro, Salim) into this company lead", by the acting user.
  6. **Delete** the other leads through Eloquent, so the observer refreshes dashboard caches.
  7. **Notify:** send the usual "lead updated" notification to the survivor's recipients.
- **Returns:** `{ lead: LeadResource, merged_count, merged_lead_ids }`.

Plain-query helpers reused: `replaceContacts`, `findForUser`, `assertLeadInCompany`, `assertAgentCanAccessLead`, `ensureCanCreateLeads`.

Before building, I'll grep for any other `lead_id` / `crm_lead_id` tables and repoint them as well, so no history is lost or deleted by the cascade.

### Routes
Both routes sit next to the existing CRM lead routes in `routes/api.php`, under the admin and agent prefixes, with the same throttle as `leads.merge`.

## Frontend
- **`lib/api/crm.ts`:** `getLeadCompanyGroups`, `mergeLeadsByCompany` and types `LeadCompanyGroup` / `MergeByCompanyResult`. Add `imported_lead_ids` to `ImportLeadsResult`.
- **`hooks/use-crm.ts`:**
  - `useLeadCompanyGroups(leadIds)` runs only on the results step when there are ids.
  - `useMergeLeadsByCompany` invalidates `CRM_KEYS.all` and the dashboard overview.
- **New `components/crm/company-merge-suggestions.tsx`:** the section sketched above, with per-group Merge / Keep separate, "Merge all", loading, error and done states. Groups with `can_merge = false` show "Ask a manager to merge".
- **`components/crm/import-leads-wizard.tsx`:** collect `imported_lead_ids` across batches and render the section on the "results" step.

The lead page's contact pager already shows "Contact N of M", so it needs no change.

## Tests
- **Unit (`CompanyNameKey`):**
  - "P23 Africa" = "p23  africa" = "P23 Africa Ltd." = "P23-Africa Limited";
  - "P23" ≠ "P23 Africa";
  - empty input gives null.
- **Feature (`LeadManagementTest`):**
  - Import returns `imported_lead_ids`.
  - `company-groups` finds Donald + Siro (new) + Salim (existing) as one group with the oldest as survivor. A single-lead company isn't grouped. An agent only sees leads they can access.
  - **merge-by-company:**
    - one lead remains, named after the company, with 3 contacts in order;
    - notes, activities, meeting links and email threads have moved;
    - the others are deleted;
    - the survivor keeps its stage and assignee;
    - an audit activity is added;
    - a contact with a duplicate email is skipped.
  - Rejected cases: different companies, a single lead, an agent without access to one of the leads.
- **Frontend (vitest):** the wizard collects ids across batches, and the suggestions component's Merge / Keep separate / Merge all behaviour.
- **Regression:** run the existing CRM suites (`tests/Feature/Crm`, `lib/crm`, `components/crm`). The only expected failures are the two already-known unrelated ones (pipeline currency, Gmail sync).

## Not included
- Merging same-company leads **outside** an upload, such as a "Find same-company leads" button on the CRM page. The same endpoints make it a small follow-up.
- **Undo** of a merge. The audit activity records what was merged.
