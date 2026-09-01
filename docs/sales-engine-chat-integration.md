# Sales Engine: Chat API Integration

## Status

Implemented. `ChatWorkspace` in `components/sales-engine/sales-engine-view.tsx` now sends
real messages through the Sales Engine API instead of the old fake `runMockSearch` timer.

## What was changed

### 1. `lib/api/sales-engine.ts`

Added chat functions alongside the existing ICP profile ones, using the same
`seRequest` + `withSessionRetry` plumbing (SE token from `lib/sales-engine/session.ts`,
`X-Organization-Id` header, automatic assertion → exchange retry on a 401):

- `createChatSession(title?)` — `POST /chat/sessions`
- `sendChatMessage(sessionId, { body, intent })` — `POST /chat/sessions/{id}/messages`
- Types: `ChatIntent`, `ChatLead`, `ChatMessageApi`

`generate_leads` / `quick_research` run discovery **synchronously** on the backend — the
POST call blocks until results are ready and returns them inline on the assistant
message. There's no separate polling step, and the discovery endpoints (`POST
/discovery/runs`, `GET /discovery/runs/{id}`, staged progress) documented in
`sales-engine/docs/FRONTEND_INTEGRATION.md` §6 are **not used here** — they're a
lower-level pair for a possible future live-progress UI, not needed for chat.

### 2. `hooks/use-sales-engine-chat.ts` (new)

`useSendChatMessage()` — a `useMutation` that creates a chat session lazily on the
first message (one session per page load; history isn't fetched or persisted across
reloads) and reuses it for the rest of the conversation. On a 401 it resets the SE auth
session via `useResetSalesEngineAuth()`, same as the ICP mutations.

`isMissingActiveIcp(error)` — helper that checks for a 422 (no active ICP profile),
which `generate_leads` and `quick_research` require.

### 3. `ChatWorkspace` (`sales-engine-view.tsx`)

- `runMockSearch()` is gone; `sendPrompt(prompt, intent)` calls `useSendChatMessage()`
  instead of faking a network round trip.
- The user's message is appended optimistically; the real assistant reply (with `leads`
  if the backend included any) replaces the canned mock reply on success.
- The "thinking" bubble and its cycling stage text are unchanged visually, but now cycle
  on an interval for as long as the mutation is actually pending (`sendMessage.isPending`)
  instead of a fixed 3-second timeout — there's no real progress signal from the backend
  for a synchronous call, so this stays cosmetic.
- Errors surface as a toast: a friendly "select an active ICP profile" message for 422,
  the backend's own message otherwise. The user's message stays in the transcript either
  way — nothing is rolled back on failure.
- The three prompt buttons and the free-text input now send real `intent` values
  (`quick_research`, `generate_leads`, `create_outreach`, `freeform`) instead of just
  canned prompt strings.
- `mockLeads` / `MockLead` are gone — lead cards render the API's `ChatLead[]` directly.

### Not in scope

- Loading historical messages (`GET /chat/sessions/{id}/messages`) — only matters once
  sessions persist across reloads, which they don't yet.
- The Discovery API's staged progress (§6) — see note above.
- The dedicated `POST /outreach/draft` endpoint (§8) — `create_outreach` returns a draft
  inline via chat for now; that's a separate feature.

## Related files

| File | Role |
| ---- | ---- |
| `components/sales-engine/sales-engine-view.tsx` | `ChatWorkspace` — wired to the real API |
| `lib/api/sales-engine.ts` | Chat + ICP API functions, shared SE request/auth plumbing |
| `hooks/use-sales-engine-chat.ts` | Chat session + send-message hook |
| `hooks/use-sales-engine-auth.ts` | SE token bootstrap (assertion → exchange), reused as-is |
| `sales-engine/docs/FRONTEND_INTEGRATION.md` | Source of truth for the API contract |
| `docs/SALES_ENGINE_FRONTEND.md` | Canonical F23-side integration guide (auth flow, troubleshooting) |

## Date

September 1, 2026
