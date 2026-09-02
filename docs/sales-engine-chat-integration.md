# Sales Engine: Chat API Integration

## Status

Implemented (September 2026). `ChatWorkspace` in `components/sales-engine/sales-engine-view.tsx`
sends real messages through the Sales Engine API — no mock data remains. Metrics and the
outreach sidebar are wired to live endpoints too.

## What was changed

### 1. `lib/api/sales-engine.ts`

Chat, metrics, and outreach functions alongside the existing ICP profile ones, all through
the same `seRequest` + `withSessionRetry` plumbing (SE token from `lib/sales-engine/session.ts`,
`X-Organization-Id` header, automatic assertion → exchange retry on a 401):

- `createChatSession(title?)`, `listChatMessages(sessionId)`, `sendChatMessage(sessionId, { body, intent })`
- `sendChatMessage` sets a 60s request timeout specifically for `generate_leads` /
  `quick_research` (the intents that run discovery synchronously — see below) via a
  `timeoutMs` option added to `seRequest`, which aborts the fetch and throws a `408`
  `SalesEngineApiError` on timeout.
- `fetchMetrics()` → `/metrics`, `fetchRecentOutreach()` → `/outreach/recent`, plus a
  `formatRelativeTime()` helper for outreach timestamps.
- Types: `ChatIntent`, `ChatLead`, `ChatMessageApi` (`intent`/`meta`/nullable `leads` match
  the real backend payload), `SendChatMessageResult`, `SalesEngineMetrics`, `OutreachActivity`.

`generate_leads` / `quick_research` require an **active ICP profile** and run discovery
**synchronously** — the POST call blocks until results are ready, then returns them inline
on `assistant_message`. There's no separate polling step, and the Discovery API
(`POST /discovery/runs`, `GET /discovery/runs/{id}`, staged progress) documented in
`sales-engine/docs/FRONTEND_INTEGRATION.md` §6 is **not used here** — it's a lower-level
pair for a possible future live-progress UI, not needed for chat.

### 2. `hooks/use-sales-engine-chat.ts`

- `useChatSession()` — creates (or reuses) a chat session id, gated on `useSalesEngineAuth()`.
- `useSendChatMessage()` — wraps it in a mutation. On success, invalidates the metrics and
  ICP caches for `generate_leads`/`quick_research` (a discovery run can create leads and
  bump the active ICP's `leadCount`), and the outreach cache for `create_outreach`, so the
  metric cards and outreach sidebar refresh automatically after a chat action. On a 401 it
  resets the SE auth session via `useResetSalesEngineAuth()`.
- `isMissingActiveIcp(error)` — helper for the 422 the backend returns when no ICP is active.

### 3. `hooks/use-sales-engine-metrics.ts` / `hooks/use-sales-engine-outreach.ts` (new)

Thin `useQuery` wrappers around `fetchMetrics()` / `fetchRecentOutreach()`, following the
same `useSalesEngineAuth()` gating and 401-reset pattern as every other Sales Engine hook.

### 4. `components/sales-engine/chat-message-body.tsx` (new)

Renders assistant replies as Markdown (`react-markdown` + `remark-gfm`), with a
`normalizeAssistantMarkdown()` pass first — GLM sometimes returns numbered/bulleted lists
without line breaks, which breaks Markdown parsing without it. Three variants: `"user"`
(plain text), `"welcome"` (the hardcoded onboarding message, `whitespace-pre-line`), and
`"assistant"` (full Markdown with custom-styled headings/lists/links/code/blockquotes).

### 5. `ChatWorkspace` (`sales-engine-view.tsx`)

- `runMockSearch()` is gone; `sendPrompt(prompt, intent)` calls `useSendChatMessage()`.
- The header ("Sales Engine" ▾) is a working dropdown: shows the active ICP build's name
  (falls back to "Sales Engine" when none is active), lists every build with the active
  one checked, switches on click (with an inline spinner + success/error toast), and has a
  "Manage ICP Builds" row that opens the full `IcpBuilderModal`. Rendered through a portal
  since the chat panel's `overflow-hidden` would otherwise clip it.
- Local message ids come from a `nextMessageIdRef` counter, not the API's own message id
  or `Date.now()` — the API's ids are session-scoped and restart from `1`, which collided
  with the hardcoded welcome message (also `id: 1`) and produced duplicate React keys.
- The "thinking" bubble cycles its stage text on an interval for as long as the mutation
  is actually pending, instead of a fixed timeout — there's no real progress signal from
  the backend for a synchronous call, so this stays cosmetic, but it no longer looks stuck
  or finishes early relative to the real request.
- Errors surface as a toast: "Select an active ICP profile first" for a 422 (via
  `isMissingActiveIcp`), the backend's own message otherwise. The user's message stays in
  the transcript either way — nothing is rolled back on failure.
- The three prompt buttons and the free-text input send real `intent` values
  (`quick_research`, `generate_leads`, `create_outreach`, `freeform`).
- Assistant/user/welcome message bodies render through `<ChatMessageBody>` instead of raw
  text, so Markdown from the backend (headings, lists, bold, links) displays correctly.
- Mock lead data, the mock metric numbers, and the hardcoded `outreachItems` array are all
  gone — lead cards, metric cards, and the outreach sidebar render live API data.

### Not in scope

- Loading historical messages (`GET /chat/sessions/{id}/messages` — `listChatMessages` is
  implemented but unused) — only matters once sessions persist across reloads, which they
  don't yet (one session per page load).
- The Discovery API's staged progress (§6) — see note above.
- The dedicated `POST /outreach/draft` endpoint (§8) — `create_outreach` returns a draft
  inline via chat for now; that's a separate feature.

## Related files

| File | Role |
| ---- | ---- |
| `components/sales-engine/sales-engine-view.tsx` | `ChatWorkspace`, metric cards, outreach panel |
| `components/sales-engine/chat-message-body.tsx` | Markdown rendering for chat messages |
| `lib/api/sales-engine.ts` | Chat + ICP + metrics + outreach API functions, shared SE request/auth plumbing |
| `hooks/use-sales-engine-chat.ts` | Chat session + send-message hook, cross-cache invalidation |
| `hooks/use-sales-engine-metrics.ts` | Metrics query hook |
| `hooks/use-sales-engine-outreach.ts` | Recent outreach query hook |
| `hooks/use-sales-engine-auth.ts` | SE token bootstrap (assertion → exchange), reused as-is |
| `sales-engine/docs/FRONTEND_INTEGRATION.md` | Source of truth for the API contract |
| `docs/SALES_ENGINE_FRONTEND.md` | Canonical F23-side integration guide (auth flow, troubleshooting) |

## Date

September 1, 2026
