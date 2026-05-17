# Route Migration Plan: Remove `/dashboard` URL Prefix from Management Routes

## Goal

| Role | Before | After |
|---|---|---|
| owner / admin / supervisor | `/dashboard/home`, `/dashboard/map`, `/dashboard/projects` … | `/home`, `/map`, `/projects` … |
| agent | `/agent/dashboard`, `/agent/map` … | unchanged |

---

## Approach: Next.js Route Group `(dashboard)`

Rename `app/dashboard/` → `app/(dashboard)/`.

Parentheses in Next.js App Router create a **route group** — the folder name is ignored in the URL, but the `layout.tsx` inside it still wraps all child routes. This is the only change needed to strip the `/dashboard` segment from every URL, with zero impact on the shared `AdminGuard + Navbar` layout.

```
BEFORE                              AFTER (URL)
app/dashboard/home/page.tsx    →    /home
app/dashboard/map/page.tsx     →    /map
app/dashboard/projects/…       →    /projects/…
app/dashboard/operations/…     →    /operations/…
app/dashboard/crm/…            →    /crm/…
app/dashboard/payroll/…        →    /payroll/…
app/dashboard/insight/…        →    /insight/…
app/dashboard/sales-engine/…   →    /sales-engine/…
```

`app/(dashboard)/layout.tsx` stays identical — `AdminGuard` still protects every route inside the group.

---

## Phase 1 — Directory Rename (1 command)

```bash
mv app/dashboard app/\(dashboard\)
```

---

## Phase 2 — Navbar (`components/layout/navbar.tsx`)

Management `basePath` becomes `''` (empty string). Agent `basePath` stays `'/agent'`.

```ts
// BEFORE
const basePath = isAgent ? '/agent' : '/dashboard';
const homeSuffix = isAgent ? '/dashboard' : '/home';

// AFTER
const basePath = isAgent ? '/agent' : '';
// homeSuffix no longer needed — management home is just '/home',
// agent home is '/agent/dashboard' = basePath + '/dashboard'
const homeSuffix = isAgent ? '/dashboard' : '/home';
```

Logo href and nav item loop already use `basePath + homeSuffix` and `basePath + item.href` — no other changes needed there. The result:

| User | Logo / Dashboard link | Map link | Projects link |
|---|---|---|---|
| management | `/home` | `/map` | `/projects` |
| agent | `/agent/dashboard` | `/agent/map` | `/agent/projects` |

---

## Phase 3 — Post-Auth Redirects (6 files)

All management landing redirects change from `/dashboard/home` → `/home`.
Plain `/dashboard` redirects (which would 404 with no index page) also become `/home`.

| File | Line | Before | After |
|---|---|---|---|
| `components/forms/login-form.tsx` | ~75 | `"/dashboard/home"` | `"/home"` |
| `components/forms/otp-form.tsx` | ~55 | `"/dashboard/home"` | `"/home"` |
| `components/forms/onboarding-form.tsx` | ~285 | `"/dashboard/home"` | `"/home"` |
| `components/forms/self-serve-onboarding-form.tsx` | ~159, ~172 | `"/dashboard"` | `"/home"` |
| `components/ui/otp-modal.tsx` | ~48 | `"/dashboard"` | `"/home"` |
| `app/enterprise/setup/page.tsx` | ~233 | `"/dashboard/home"` | `"/home"` |

---

## Phase 4 — Auth Guards (2 files)

| File | Line | Before | After |
|---|---|---|---|
| `components/auth/agent-guard.tsx` | ~19 | `router.replace("/dashboard/home")` | `router.replace("/home")` |
| `components/auth/admin-guard.tsx` | ~22 | `router.replace("/agent/dashboard")` | **no change** (agent redirect, already correct) |

---

## Phase 5 — Internal Links Inside `app/(dashboard)/` Pages (9 occurrences)

All `router.push` calls and `basePath` props inside the management pages drop the `/dashboard` segment.

### `app/(dashboard)/projects/page.tsx` (line ~48)
```ts
// BEFORE
router.push(`/dashboard/projects/${slug}`);
// AFTER
router.push(`/projects/${slug}`);
```

### `app/(dashboard)/projects/[projectId]/page.tsx` (line ~15)
```tsx
// BEFORE
<ProjectDetailsView basePath="/dashboard" />
// AFTER
<ProjectDetailsView basePath="" />
```

### `app/(dashboard)/home/page.tsx` (line ~71)
```tsx
// BEFORE
<DashboardMap basePath="/dashboard" />
// AFTER
<DashboardMap basePath="" />
```

### `app/(dashboard)/crm/page.tsx` (lines ~321, ~498, ~579, ~644)
```ts
// BEFORE
router.push(`/dashboard/crm/leads/${item.id}`);  // ×2
router.push(`/dashboard/crm/leads`);
const basePath = "/dashboard";
// AFTER
router.push(`/crm/leads/${item.id}`);  // ×2
router.push(`/crm/leads`);
const basePath = "";
```

### `app/(dashboard)/crm/leads/page.tsx` (lines ~142, ~262, ~411)
```ts
// BEFORE
const basePath = "/dashboard";
router.push("/dashboard/crm");
router.push(`/dashboard/crm/leads/${lead.id}`);
// AFTER
const basePath = "";
router.push("/crm");
router.push(`/crm/leads/${lead.id}`);
```

### `app/(dashboard)/operations/page.tsx` (line ~52)
```tsx
// BEFORE
<AgentView basePath="/dashboard" />
<AttendanceView basePath="/dashboard" />
// AFTER
<AgentView basePath="" />
<AttendanceView basePath="" />
```

### `app/(dashboard)/operations/[projectId]/page.tsx` (lines ~141, ~178)
```ts
// BEFORE
const basePath = "/dashboard";
router.push("/dashboard/operations");
// AFTER
const basePath = "";
router.push("/operations");
```

### `app/(dashboard)/payroll/page.tsx` (line ~113)
```ts
// BEFORE
router.push("/dashboard/payroll/payroll-list");
// AFTER
router.push("/payroll/payroll-list");
```

---

## Phase 6 — Verification Checklist

- [ ] `grep -r '"/dashboard' app/ components/` returns zero route-string hits
- [ ] `app/dashboard/` directory no longer exists (replaced by `app/(dashboard)/`)
- [ ] `/dashboard/home` → 404
- [ ] `/home` → management home page (AdminGuard active)
- [ ] `/map` → management map page
- [ ] `/projects` → management projects page
- [ ] `/agent/dashboard` → agent dashboard (unchanged)
- [ ] `/agent/map` → agent map (unchanged)
- [ ] Login as owner/admin/supervisor → redirects to `/home`
- [ ] Login as agent → redirects to `/agent/dashboard`
- [ ] Accessing `/home` as an agent → AdminGuard redirects to `/agent/dashboard`
- [ ] Accessing `/agent/*` as a management user → AgentGuard redirects to `/home`
- [ ] Navbar logo click (management) → `/home`
- [ ] Navbar logo click (agent) → `/agent/dashboard`

---

## File Change Summary

| File | Change |
|---|---|
| `app/dashboard/` | Rename → `app/(dashboard)/` |
| `components/layout/navbar.tsx` | `basePath` for management: `'/dashboard'` → `''` |
| `components/forms/login-form.tsx` | Redirect: `/dashboard/home` → `/home` |
| `components/forms/otp-form.tsx` | Redirect: `/dashboard/home` → `/home` |
| `components/forms/onboarding-form.tsx` | Redirect: `/dashboard/home` → `/home` |
| `components/forms/self-serve-onboarding-form.tsx` | Redirect: `/dashboard` → `/home` (×2) |
| `components/ui/otp-modal.tsx` | Redirect: `/dashboard` → `/home` |
| `app/enterprise/setup/page.tsx` | Redirect: `/dashboard/home` → `/home` |
| `components/auth/agent-guard.tsx` | Fallback: `/dashboard/home` → `/home` |
| `app/(dashboard)/home/page.tsx` | `basePath="/dashboard"` → `basePath=""` |
| `app/(dashboard)/projects/page.tsx` | router.push path |
| `app/(dashboard)/projects/[projectId]/page.tsx` | `basePath="/dashboard"` → `basePath=""` |
| `app/(dashboard)/crm/page.tsx` | 4 occurrences |
| `app/(dashboard)/crm/leads/page.tsx` | 3 occurrences |
| `app/(dashboard)/operations/page.tsx` | `basePath="/dashboard"` → `basePath=""` (×2) |
| `app/(dashboard)/operations/[projectId]/page.tsx` | 2 occurrences |
| `app/(dashboard)/payroll/page.tsx` | router.push path |

**Total: 1 directory rename + ~25 string replacements across 16 files.**
