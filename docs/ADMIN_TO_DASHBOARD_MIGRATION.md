# Route Migration Plan: `/admin/*` → `/dashboard/*`

## Summary

Rename the management route namespace from `/admin` to `/dashboard` for all non-agent roles (`owner`, `supervisor`, `admin`). Agent routes (`/agent/*`) are unchanged. No database or API changes required — this is purely a frontend routing rename.

---

## Scope

| What changes | What stays the same |
|---|---|
| `app/admin/` directory → `app/dashboard/` | `app/agent/` (untouched) |
| All `/admin/...` hrefs, pushes, redirects | `AdminGuard` component name and role logic |
| Navbar `basePath` variable | `AgentGuard` component (only fix fallback redirect) |
| Login / OTP / onboarding post-auth redirects | API calls, guards' role arrays |

---

## Phase 1 — Directory Rename

| Action | From | To |
|---|---|---|
| Rename directory | `app/admin/` | `app/dashboard/` |

Everything inside moves with it (Next.js file-system routing picks up the new name automatically):

```
app/dashboard/
  layout.tsx
  generic-placeholder.tsx
  home/page.tsx
  map/page.tsx
  operations/page.tsx
  operations/agents/page.tsx
  operations/attendance/page.tsx
  operations/[projectId]/page.tsx
  projects/page.tsx
  projects/[projectId]/page.tsx
  crm/page.tsx
  crm/leads/page.tsx
  crm/leads/[id]/page.tsx
  insight/page.tsx
  payroll/page.tsx
  payroll/payroll-list/page.tsx
  sales-engine/page.tsx
```

---

## Phase 2 — Fix Internal Links (file-by-file)

### 2.1 `components/layout/navbar.tsx`

**Line ~84** — the `basePath` variable that prefixes every nav link:

```ts
// BEFORE
const basePath = user?.active_company?.role === 'agent' ? '/agent' : '/admin';

// AFTER
const basePath = user?.active_company?.role === 'agent' ? '/agent' : '/dashboard';
```

This single change fixes every navbar link for management roles because all hrefs are built as `basePath + item.href`.

---

### 2.2 `components/forms/login-form.tsx` (line ~75)

```ts
// BEFORE
router.push(res.data.user_type === "agent" ? "/agent/dashboard" : "/admin/dashboard");

// AFTER
router.push(res.data.user_type === "agent" ? "/agent/dashboard" : "/dashboard/home");
```

---

### 2.3 `components/forms/otp-form.tsx` (line ~55)

```ts
// BEFORE
response.data.onboarding_completed ? "/admin/dashboard" : "/complete-onboarding"

// AFTER
response.data.onboarding_completed ? "/dashboard/home" : "/complete-onboarding"
```

---

### 2.4 `components/forms/onboarding-form.tsx` (line ~285)

```ts
// BEFORE
role === "agent" ? "/agent/dashboard" : "/admin/dashboard"

// AFTER
role === "agent" ? "/agent/dashboard" : "/dashboard/home"
```

---

### 2.5 `components/auth/agent-guard.tsx` (line ~19)

The fallback redirect when a non-agent accesses an agent route:

```ts
// BEFORE
router.replace("/admin/dashboard");

// AFTER
router.replace("/dashboard/home");
```

---

### 2.6 `app/enterprise/setup/page.tsx` (line ~233)

Post-enterprise-setup redirect:

```ts
// BEFORE
router.push("/admin/dashboard");

// AFTER
router.push("/dashboard/home");
```

---

### 2.7 `app/dashboard/projects/page.tsx` (was admin/projects/page.tsx, line ~48)

Internal navigation after renaming:

```ts
// BEFORE
router.push(`/admin/projects/${slug}`);

// AFTER
router.push(`/dashboard/projects/${slug}`);
```

---

### 2.8 `app/dashboard/projects/[projectId]/page.tsx` (line ~15)

```tsx
// BEFORE
<SomeComponent basePath="/admin" />

// AFTER
<SomeComponent basePath="/dashboard" />
```

---

### 2.9 `app/dashboard/crm/page.tsx` (lines ~321, ~498, ~579, ~644)

```ts
// BEFORE (3 router.push + 1 basePath prop)
router.push(`/admin/crm/leads/${item.id}`);  // ×2
router.push("/admin/crm/leads");
basePath = "/admin"

// AFTER
router.push(`/dashboard/crm/leads/${item.id}`);  // ×2
router.push("/dashboard/crm/leads");
basePath = "/dashboard"
```

---

### 2.10 `app/dashboard/crm/leads/page.tsx` (lines ~142, ~262, ~411)

```ts
// BEFORE
basePath = "/admin"
router.push("/admin/crm");
router.push(`/admin/crm/leads/${lead.id}`);

// AFTER
basePath = "/dashboard"
router.push("/dashboard/crm");
router.push(`/dashboard/crm/leads/${lead.id}`);
```

---

### 2.11 `app/dashboard/operations/page.tsx` (line ~52)

```tsx
// BEFORE
<SomeComponent basePath="/admin" />   // appears twice on the line

// AFTER
<SomeComponent basePath="/dashboard" />
```

---

### 2.12 `app/dashboard/operations/[projectId]/page.tsx` (lines ~141, ~178)

```ts
// BEFORE
basePath = "/admin"
router.push("/admin/operations");

// AFTER
basePath = "/dashboard"
router.push("/dashboard/operations");
```

---

### 2.13 `app/dashboard/home/page.tsx` (was `app/admin/dashboard/page.tsx`, line ~71)

Also rename the sub-directory: `app/dashboard/dashboard/` → `app/dashboard/home/`

```tsx
// BEFORE
<SomeComponent basePath="/admin" />

// AFTER
<SomeComponent basePath="/dashboard" />
```

---

### 2.14 `app/dashboard/payroll/page.tsx` (line ~113)

```ts
// BEFORE
router.push("/admin/payroll/payroll-list");

// AFTER
router.push("/dashboard/payroll/payroll-list");
```

---

## Phase 3 — Verify `AdminGuard` (no changes needed)

`components/auth/admin-guard.tsx` checks roles (`owner`, `admin`, `supervisor`) and renders children or redirects — it contains **no hardcoded paths**. No changes required.

`app/dashboard/layout.tsx` (renamed from `app/admin/layout.tsx`) imports `AdminGuard` by component name — the import path changes automatically when the file moves with the directory.

---

## Phase 4 — Quick Verification Checklist

After implementation, confirm:

- [ ] `grep -r '"/admin' app/` returns zero results
- [ ] `grep -r "'/admin" app/` returns zero results  
- [ ] `grep -r '"/admin' components/` returns zero results
- [ ] Navigating to `/admin/dashboard` returns 404
- [ ] Navigating to `/dashboard/dashboard` returns 404 (renamed to `/dashboard/home`)
- [ ] Login as `owner/admin/supervisor` → redirects to `/dashboard/home`
- [ ] Login as `agent` → redirects to `/agent/dashboard`
- [ ] All navbar links for management user resolve correctly
- [ ] Accessing `/dashboard/*` as an agent redirects away (AdminGuard)
- [ ] Accessing `/agent/*` as a management user → redirects to `/dashboard/home`

---

## File Change Summary

| File | Change type |
|---|---|
| `app/admin/` (entire directory) | Rename to `app/dashboard/` |
| `components/layout/navbar.tsx` | 1 string replacement |
| `components/forms/login-form.tsx` | 1 string replacement |
| `components/forms/otp-form.tsx` | 1 string replacement |
| `components/forms/onboarding-form.tsx` | 1 string replacement |
| `components/auth/agent-guard.tsx` | 1 string replacement |
| `app/enterprise/setup/page.tsx` | 1 string replacement |
| `app/dashboard/projects/page.tsx` | 1 string replacement |
| `app/dashboard/projects/[projectId]/page.tsx` | 1 string replacement |
| `app/dashboard/crm/page.tsx` | 4 string replacements |
| `app/dashboard/crm/leads/page.tsx` | 3 string replacements |
| `app/dashboard/operations/page.tsx` | 2 string replacements |
| `app/dashboard/operations/[projectId]/page.tsx` | 2 string replacements |
| `app/dashboard/dashboard/` sub-directory | Rename to `app/dashboard/home/` |
| `app/dashboard/home/page.tsx` | 1 string replacement |
| `app/dashboard/payroll/page.tsx` | 1 string replacement |

**Total: 2 directory renames + ~22 string replacements across 14 files.**
