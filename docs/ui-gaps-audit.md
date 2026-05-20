# UI Gaps Audit — Unimplemented Elements

> Generated: 2026-05-19 | Total: 52 unimplemented UI elements

---

## Placeholder Pages (6)

| # | File | Issue |
|---|---|---|
| 1 | `app/(dashboard)/insight/page.tsx` | Entire page is a placeholder — no API, no UI |
| 2 | `app/(dashboard)/sales-engine/page.tsx` | Entire page is a placeholder |
| 3 | `app/agent/insight/page.tsx` | Agent version, same placeholder |
| 4 | `app/agent/sales-engine/page.tsx` | Agent version, same placeholder |
| 5 | `app/(dashboard)/generic-placeholder.tsx` | Template stub |
| 6 | `app/agent/generic-placeholder.tsx` | Template stub |

---

## Navbar Icon Buttons — No onClick (4)

| # | File | Line | Element |
|---|---|---|---|
| 7 | `components/layout/navbar.tsx` | 169 | Notification bell — badge is hardcoded, no handler |
| 8 | `components/layout/navbar.tsx` | 178 | Settings icon — no handler |
| 9 | `components/layout/navbar.tsx` | 398 | Mobile notification button — no handler |
| 10 | `components/layout/navbar.tsx` | 406 | Mobile settings button — no handler |

---

## CRM — Add Leads Buttons (3)

| # | File | Line | Element |
|---|---|---|---|
| 11 | `components/crm/crm-leads-list-page.tsx` | 128 | "Add New Leads" — no onClick, no modal |
| 12 | `components/crm/crm-kanban-page.tsx` | 158 | "Add Leads" per kanban column — no handler |
| 13 | `components/crm/crm-kanban-page.tsx` | 390 | "Add New Leads" main board — no handler |

---

## Attendance Controls (3)

| # | File | Line | Element |
|---|---|---|---|
| 14 | `components/operations/attendance-view-agent.tsx` | 95 | "Monthly" filter dropdown — no handler |
| 15 | `components/operations/attendance-view-agent.tsx` | 101 | "Download" export button — no handler |
| 16 | `components/operations/attendance-view-agent.tsx` | 118 | **"Clock In" button** — misleading, no handler |

---

## "View All" Summary Card Buttons (7)

| # | File | Lines | Element |
|---|---|---|---|
| 17–19 | `components/operations/projects-view.tsx` | 633, 679, 726 | 3× "View All" on Total / Pending / Incomplete cards |
| 20–21 | `components/operations/projects-view-agents.tsx` | 613, 659 | 2× "View All" on project summary cards |
| 22–24 | `components/operations/projects/summary-cards.tsx` | 174, 220, 267 | 3× "View All" on summary cards |

---

## Dashboard Cards (3)

| # | File | Line | Element |
|---|---|---|---|
| 26 | `components/dashboard/dashboard-cards.tsx` | 303 | "View All Task" — no handler |
| 27 | `components/dashboard/dashboard-cards.tsx` | 506 | "View All Task" (purple card) — no handler |
| 28 | `components/dashboard/dashboard-cards.tsx` | 599 | **"Try AI"** — feature not implemented |

---

## Operations Calendar (1)

| # | File | Line | Element |
|---|---|---|---|
| 25 | `components/operations/operations-calendar.tsx` | 127 | Floating "+" Add button — no handler |

---

## Payroll Controls — Date / Export / Filter (12)

| # | File | Lines | Elements |
|---|---|---|---|
| 33–35 | `app/agent/payroll/page.tsx` | 89, 98, 108 | Date picker, Export, Filter |
| 36–38 | `app/(dashboard)/payroll/page.tsx` | 89, 98, 108 | Date picker, Export, Filter |
| 39–41 | `app/agent/payroll/payroll-list/page.tsx` | 89, 98, 108 | Date picker, Export, Filter |
| 42–44 | `app/(dashboard)/payroll/payroll-list/page.tsx` | 89, 98, 108 | Date picker, Export, Filter |

---

## Payroll Sidebar Icons (3)

| # | File | Line | Element |
|---|---|---|---|
| 30 | `components/payroll/payroll-sidebar.tsx` | 146 | Message icon — no handler |
| 31 | `components/payroll/payroll-sidebar.tsx` | 149 | Customize icon — no handler |
| 32 | `components/payroll/payroll-sidebar.tsx` | 157 | Export icon — no handler |

---

## CRM Lead Detail — Action Icons (4)

| # | File | Line | Element |
|---|---|---|---|
| 45–46 | `app/agent/crm/leads/[id]/page.tsx` | 1015, 1018 | Message icon, Map Pin icon — no handlers |
| 47–48 | `app/(dashboard)/crm/leads/[id]/page.tsx` | 1015, 1018 | Message icon, Map Pin icon — no handlers |

---

## Misleading Buttons (2)

| # | File | Line | Element |
|---|---|---|---|
| 50 | `app/agent/operations/agents/page.tsx` | 157 | **"View on Map"** — suggests navigation but no handler |
| 51 | `app/(dashboard)/operations/agents/page.tsx` | 157 | **"View on Map"** — suggests navigation but no handler |

---

## Project Card Menu + Dashboard More Menu (2)

| # | File | Line | Element |
|---|---|---|---|
| 49 | `components/operations/projects/project-card.tsx` | 23 | Three-dot menu icon — no dropdown |
| 52 | `components/dashboard/dashboard-top-customers.tsx` | 169 | "More Horizontal" icon — no handler |

---

## Priority Summary

| Priority | Items | Reason |
|---|---|---|
| High | CRM "Add New Leads" (#11–13) | Core data creation flow — users expect this to work |
| High | Attendance "Clock In" (#16) | Misleading — appears functional, does nothing |
| High | "View on Map" on agents (#50–51) | Misleading label on an active-agent indicator |
| Medium | Payroll Export / Filter (#33–44) | Utility controls users will reach for |
| Medium | "View All" task buttons (#17–24, 26–27) | Drill-down navigation expected |
| Low | Navbar notification / settings (#7–10) | Common icons, low urgency |
| Low | Placeholder pages (#1–6) | Entire features, separate planning required |
