# Sales Engine: Chat API Integration Plan

## Status

**Implemented** (September 2026). Chat, metrics, and outreach sidebar are wired to the Sales Engine API. See `lib/api/sales-engine.ts`, `hooks/use-sales-engine-chat.ts`, and `ChatWorkspace` in `sales-engine-view.tsx`.

## Where this lives today

`components/sales-engine/sales-engine-view.tsx` — the `ChatWorkspace` component. Currently
100% mocked:

- `initialMessages` — hardcoded welcome message
- `mockLeads` — 3 hardcoded lead cards
- `runMockSearch()` — on submit, fakes a 3s "thinking" delay (cycling through
  `thinkingStages`), then appends a canned assistant reply with `mockLeads`
- The three prompt buttons ("Quick Research", "Generate New Leads", "Create Outreach
  Message") just call `runMockSearch()` with a canned prompt string

None of this touches the network. The goal is to replace `runMockSearch` and the mock
data with real calls, without changing the visual design.

## Backend contract (source: `sales-engine/docs/FRONTEND_INTEGRATION.md` §5–6)

### Auth

Same as ICP profiles — Sales Engine Bearer token from the existing
`useSalesEngineAuth()` handshake (F23 session → assertion → exchange). No new auth work
needed here; reuse it.

### Endpoints

| Method | Path                           | Purpose                                 |
| ------ | ------------------------------ | --------------------------------------- |
| POST   | `/chat/sessions`               | Start a chat session (`{ title? }`)     |
| GET    | `/chat/sessions/{id}/messages` | Load a session's message history        |
| POST   | `/chat/sessions/{id}/messages` | Send a message, get the assistant reply |

Message intents: `freeform` \| `quick_research` \| `generate_leads` \| `create_outreach`

Send-message request:

```json
{ "body": "Find distributors in Lagos", "intent": "generate_leads" }
```

Assistant response may include inline leads:

```json
{
  "role": "assistant",
  "body": "...",
  "leads": [
    {
      "id": 1,
      "name": "...",
      "source": "serper",
      "score": 82,
      "summary": "..."
    }
  ]
}
```

**Constraint:** `generate_leads` and `quick_research` require an **active ICP profile**
and run discovery **synchronously** — the POST call blocks until results are ready, then
returns them inline. There is no separate "poll for progress" step for chat messages.
If no ICP is active, expect a **422**.

### Discovery API (§6) — not needed for this feature

`POST /discovery/runs` + `GET /discovery/runs/{id}` (staged: `analyzing_brief` →
`searching_sources` → `extracting` → `compiling_results`) is a separate, lower-level
endpoint pair for a dedicated discovery-progress UI. Chat does **not** call these
directly — it gets the same result synchronously through the chat message endpoint.
Documented here only so we don't accidentally build against the wrong endpoint.
Revisit if we ever want a live, real progress bar instead of the cosmetic one below.

## Implementation plan

### 1. `lib/api/sales-engine.ts` — add chat functions

```ts
export type ChatIntent =
  | "freeform"
  | "quick_research"
  | "generate_leads"
  | "create_outreach";

export type ChatLead = {
  id: number;
  name: string;
  source: string;
  score: number;
  summary: string;
};

export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  body: string;
  leads?: ChatLead[];
  created_at?: string;
};

export function createChatSession(
  token: string,
  title?: string,
): Promise<{ id: number }>;
export function listChatMessages(
  sessionId: number,
  token: string,
): Promise<ChatMessage[]>;
export function sendChatMessage(
  sessionId: number,
  payload: { body: string; intent: ChatIntent },
  token: string,
): Promise<ChatMessage>;
```

All three go through the existing `seRequest` wrapper (resource endpoints, `{ data }`
wrapped) — no new auth or error-handling plumbing needed.

### 2. `hooks/use-sales-engine-chat.ts` — new hook

Mirrors `use-sales-engine-icp.ts`:

- `useChatSession()` — creates (or reuses) a session id. Session id is created lazily on
  first message send, kept in component state for the lifetime of the page (not
  persisted across reloads for v1 — reopening the panel starts a fresh session, matching
  current mock behavior where `initialMessages` always resets on mount).
- `useSendChatMessage()` — `useMutation` wrapping `sendChatMessage`, with the same
  401 → `resetSalesEngineAuth()` handling already used for ICP mutations.
- Both read the SE token from `useSalesEngineAuth()`, same as ICP hooks — no token
  plumbing duplicated.

### 3. `ChatWorkspace` changes

- Replace `useState<ChatMessage[]>(initialMessages)` seed with the same welcome message
  (kept client-side — it's onboarding copy, not from the API) plus real messages appended
  as they come in.
- Replace `runMockSearch(prompt)` body:
  1. Append the user's message to local state immediately (optimistic).
  2. Ensure a session exists (create one on first call).
  3. Call `sendChatMessage(sessionId, { body: prompt, intent }, token)`.
  4. On success, append the returned assistant message (with `leads` if present) to
     local state.
  5. On error:
     - **422** (no active ICP, only relevant for `quick_research`/`generate_leads`) →
       toast "Select an active ICP profile first" and optionally open the ICP Builder
       modal directly.
     - **401** → handled by the shared reset-and-retry path.
     - anything else → toast the error message, keep the user's message in the
       transcript so nothing is lost.
- The `isThinking` / `thinkingStage` cycling animation **stays exactly as-is** — it's
  cosmetic, driven by `mutation.isPending`, not real backend progress (see Discovery API
  note above). No behavior change needed there beyond swapping the fake `setTimeout`
  chain for `sendChatMessage`'s pending state.
- Map the three prompt buttons to real intents instead of canned prompt strings:
  - "Quick Research" → `intent: "quick_research"`
  - "Generate New Leads" → `intent: "generate_leads"`
  - "Create Outreach Message" → `intent: "create_outreach"`
  - Free-typed messages in the input box → `intent: "freeform"`
- Delete `mockLeads` and `LeadInlineResults`' dependency on the `MockLead` type; use the
  `leads` array returned inline on the assistant message instead (shape is compatible —
  `name`, `source`, `score`, `summary` already match).

### 4. Not in scope for this pass

- Loading historical messages via `GET /chat/sessions/{id}/messages` (only matters once
  sessions persist across reloads — not needed while sessions are page-lifetime only).
- The Discovery API (§6) and its staged progress — only needed if we later want a real
  (not cosmetic) progress indicator.
- Outreach draft endpoints (§8) — `create_outreach` intent returns a draft inline via
  chat for now; the dedicated `POST /outreach/draft` endpoint is a separate feature.

## Open questions for the backend team

1. Session lifetime — do sessions expire, and is there a limit on sessions per org/user
   we should be aware of before creating one per page load?
2. Timeout — "runs discovery synchronously" for `generate_leads`/`quick_research`: what's
   the expected/max response time, so we can set a sane client-side request timeout and
   avoid the "thinking" animation looking stuck on a slow query?

## Related files

| File                                            | Role                                            |
| ----------------------------------------------- | ----------------------------------------------- |
| `components/sales-engine/sales-engine-view.tsx` | `ChatWorkspace` — UI to wire up                 |
| `lib/api/sales-engine.ts`                       | Add chat API functions here                     |
| `hooks/use-sales-engine-auth.ts`                | Existing SE token bootstrap — reuse, no changes |
| `hooks/use-sales-engine-chat.ts`                | New — chat session + send-message hooks         |
| `sales-engine/docs/FRONTEND_INTEGRATION.md`     | Source of truth for the API contract            |

## Date

September 1, 2026
