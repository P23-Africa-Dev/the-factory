# Sales Engine & Social Listening — Requirements Audit

**Date:** 12 November 2026
**Audited against:** "Buyer Signal Detection & Enrichment Spec" and "Sales Engine – Product Overview"
**Code audited:**
- Frontend: `the-factory` at commit `8d790c02` (branch `project-upgrade`)
- Backend: `sales-engine/backend` at `origin/main` commit `4d0e029` (12 Nov 2026)

---

## 1. Summary for management

**What was asked for.** A system that (1) finds *specific, recent, sourced business events* (a company opens an office in Kenya, appoints a distributor, hires a country manager), (2) keeps only the companies that match the customer profile, and (3) attaches a real contact person with email and LinkedIn.

**What was built.** A working product with a lot of real engineering in it, but aimed at a different target. Social Listening is built to find *people on social media who are asking for something* ("can anyone recommend…", "we're fed up with…"). The event detection the requirement describes was added on top of that later, shares its small search budget, and searches the same social sites.

**Overall completion against the requirement: about 50%.** The half that is missing is what decides whether results are useful, which is why management experiences it as 20%.

**The six causes, in order of impact**

| # | Cause | Plain meaning |
| --- | --- | --- |
| 1 | Events are searched on social networks only | Market entries, distributor deals and executive appointments are published in news and press releases. The system never searches news. |
| 2 | Hard 30-day limit | Anything older than 30 days is discarded, even though each event type is configured for 90–180 days. The requirement's example is 6 months. |
| 3 | The ICP filter does not filter in Social Listening | The check runs with no company data and always answers "pass". Every signal is shown as matching industry, territory, size and revenue, whether it does or not. |
| 4 | The profile cannot say "based in Germany, entering Africa" | There is one territory list. The client's core use case needs two. |
| 5 | Found contacts are thrown away | When the system finds an email for a signal it records only "found: yes". The address itself is not saved, and it is not looked up again when the signal is added to the CRM. |
| 6 | Search and data-provider limits | Each scan may make at most 30 searches and qualify 25 posts. An internal note from September says the search, Apollo and Hunter accounts were on free plans that refuse the calls the product depends on. Whether they have been upgraded is not visible in code. |

**Recommended decision.** Do not onboard the waiting client until the P0 items in section 8 are done. Items 1, 2, 3 and 5 above are contained changes; item 4 needs a small design decision.

---

## 2. Scope and limits

| Area | Audited | Notes |
| --- | --- | --- |
| Frontend (Sales Engine + Social Listening screens, ICP builder, API client) | Read in full | `components/sales-engine/`, `lib/api/sales-engine.ts`, `lib/sales-engine/` |
| `the-factory/backend` | Read | Holds Sales Engine *access* only (access requests, login hand-off). No signal, ICP or enrichment logic. |
| `sales-engine/backend` — Social Listening pipeline, signal detection, ICP filter, enrichment | Read in full | `app/Services/Intent/`, `SignalDetection/`, `IcpFiltering/`, `Enrichment/` |
| `sales-engine/backend` — Smart Lead (chat discovery) pipeline | Read in part | Gates and query construction checked; the 3,200-line orchestrator was not read line by line. |
| Automated tests | **Not run** | Backend has about 590 test methods. Neither PHP nor a working JS test runner was available in the audit environment. Nothing here says whether tests pass. |
| Live behaviour | **Not checked** | No scan was run. Production settings (API keys, paid plans, env overrides) are not visible in code. |

Findings are tagged **[Code]** (read directly) or **[Unknown]** (needs production access or a live run).

**Repository warning.** The local `sales-engine` checkout is on branch `dev`, where the backend code is from 9 October. All current backend work is on `origin/main`. Anyone developing from `dev` is a month behind what is deployed and what the frontend expects.

---

## 3. How the system is put together

```
Browser (the-factory, Next.js)
   │  logs in to Factory23 ──► the-factory/backend issues a 60-second pass
   │  exchanges the pass for a Sales Engine token
   ▼
Sales Engine API (sales-engine/backend, separate Laravel app + database)
   ├─ Smart Lead tab      → DiscoveryOrchestrator   (company search by description)
   └─ Social Listening tab → SocialListeningOrchestrator (posts → signals)
```

### What a Social Listening scan actually does [Code]

1. An AI model reads the profile's free-text brief and decides what kind of need it is (find customers, suppliers, investors, partners) and writes a "listening plan": offer, synonyms, pain phrases, competitors.
2. It builds up to 24 short **buyer-intent** queries ("recommend …", "alternative to …", "frustrated with …") and, if event packs are on, one or two queries per event type.
3. It runs them against Reddit, X and LinkedIn (Facebook/Instagram and YouTube only as fallbacks), stopping at **30 searches** or 45 promising posts.
4. Each post must have a link and a date inside the window, or it is dropped. *(This rule is real and enforced.)*
5. A cheap text filter drops job ads, listicles and self-promotion.
6. At most **25** posts go to the AI for reading and scoring.
7. Event-tagged posts are checked against their event definition.
8. A final gate keeps buyer asks, or confirmed events.
9. The ICP filter is called — with empty data (see 5.1).
10. A signal is saved and a background job looks for a contact.

Steps 2, 3 and 6 are where the requirement and the build part ways: the plan is to find *asks*, the budget is small, and the places searched are social sites.

---

## 4. Completion by feature

| # | Feature (Product Overview §3) | Built | Meets the requirement | Main reason for the gap |
| --- | --- | --- | --- | --- |
| 1 | ICP Filter | 75% | **40%** | Not applied in Social Listening; one territory field; no company-size/revenue data source |
| 2 | Signal Detection | 65% | **40%** | Social-only sources; events share a small budget; mismatches kept as generic signals |
| 3 | Signal Validation | 80% | **65%** | Link + date rule enforced; window capped at 30 days |
| 4 | Company Identification | 70% | **60%** | Company named by AI from a snippet; no firmographics |
| 5 | People Identification | 60% | **50%** | Names only; falls back to the post's author |
| 6 | Contact Enrichment | 70% | **35%** | Found contact details not saved; role search depends on a paid Apollo plan |
| 7 | Lead Management | 85% | **75%** | No results table in the specified shape; no export |
| | **Overall** | **~72%** | **~50%** | |

"Built" = code exists and is wired. "Meets the requirement" = does what the two documents ask.

---

## 5. Findings in detail

### 5.1 ICP Filter — 40%

**Working**
- All five fields exist and are stored: industry, size, revenue, territory, target roles [Code].
- A proper pass/fail filter service exists (`IcpFilterService`), with territory aliasing (Lagos ↔ Nigeria ↔ NG) and exclusion terms [Code].
- Smart Lead applies it as a hard gate on territory, and on size/revenue when the source page happens to state them (`DiscoveryOrchestrator::icpHardGateResult`) [Code].

**Gaps**
- **In Social Listening the filter is a no-op [Code].** `SocialListeningOrchestrator.php` (line 392) calls the filter with a candidate whose industry, size, revenue and territory are all `null`, and with an empty "available fields" list. By the filter's own rules, a field not in that list is "not evaluated" and passes. Result: `icp_filter_passed` is always true and all four reasons are always true. The `icpMismatch` counter in the scan summary can never be anything but 0. The per-account switch `icp_filter_enabled` is stored but never read.
- **The screen then misreports it [Code].** The signal panel prints "ICP filter — Matched: industry, territory, company size, revenue" from those always-true values.
- **One territory field [Code].** No way to separate where the company is based from the market it is entering.
- **No firmographic data source [Code].** The filter's own comment says no provider supplies company size or revenue. Those two ICP fields cannot be checked for most companies in either tab.
- **Soft in Smart Lead [Code].** Leads under the match threshold are still returned as "advisory" or "secondary" results rather than discarded.
- **ICP text as search text [Code].** In Smart Lead the query falls back to the description, then `"<industries> companies"`; territories are sent to the search engine as location. In Social Listening, territory is added to buyer-intent queries as a place word. The backend plan documents geography as a deliberate exception to the rule.

### 5.2 Signal Detection — 40%

**Working**
- 18 event types are defined as data, with trigger text, valid/invalid examples and a recency window each, in five packs: Core Buyer Signals (4), Software/Dev (5), Lagos Corporate Transport (5), Supply (2), Funding (2) (`SignalTypeDefinitionSeeder`) [Code].
- An account can override a built-in type without code changes (`SignalTypeRegistry`) [Code].
- A dedicated per-type check asks the AI "is this really this event?" with the examples, and handles the spec's export-direction case explicitly (`SignalExtractor`) [Code].
- Job-posting first-seen tracking exists for the "unfilled developer roles" type (`JobPostingWatch`) [Code].

**Gaps**
- **No news or press-release search [Code].** Every search adapter registered for Social Listening is a social source: LinkedIn, X, Reddit, Meta, YouTube. The Serper adapters add `site:linkedin.com` (etc.) to every query and call the web-search endpoint, never the news endpoint.
- **Weak event queries [Code].** The query is the type's label plus the first eight words of its trigger description, e.g. roughly `New Market Entry Company announces opening an office, subsidiary, warehouse`. The target market (Kenya, Nigeria…) is deliberately left out unless the type's own text names a place.
- **Events are second-class in the budget [Code].** One event query is slotted in after every two buyer-intent queries, within a 30-search cap, with at most 8 event types per run.
- **Event packs can be silently skipped [Code].** If the AI classifies the profile's need as anything other than "find customers" and the user has only the default pack, no event queries run at all.
- **A failed event check does not reject the post [Code].** It strips the event tag and passes the post on as a general signal. The `typeMismatch` counter is hard-coded to 0. The spec says: event does not match the type → reject.
- **Most saved signals are untyped [Code].** They come from the buyer-intent queries and carry the older labels (Recommendation, Switching, Pricing…). The frontend comment says the same.
- **Job posts are blocked before they can match [Code].** The pre-filter drops any URL containing `/jobs` or `/careers` and any text like "we're hiring" or "vacancy", even for event-tagged hits. The job-post event types can rarely fire.
- **Sources offered to the user are social only [Code]**, and packs are hard-coded in the frontend ICP builder although the API serves the list.
- **Smart Lead has no event step [Code].**

### 5.3 Signal Validation — 65%

**Working**
- `SignalGroundingGate`: no link → rejected; no date → rejected; older than the window → rejected. No "low confidence" pass-through. This is exactly the spec's rule, and it is wired in [Code].
- Dates are recovered where possible (Reddit post data, LinkedIn activity IDs, a capped number of page fetches) before the gate runs [Code].
- Rejection counts by reason are stored on every run [Code].

**Gaps**
- **30-day hard cap [Code].** `MAX_FRESHNESS_WINDOW_DAYS = 30`. The gate is called with the scan window, never with the event type's own window (180 days for all four core types). The frontend also offers only 7/14/30.
- **Date is the post's date, not the event's [Code].**
- **No link verification [Code].** The link is required to exist as a value; it is not fetched to confirm it resolves or supports the claim (page fetches are for dates only, capped at 12 per run).
- **Old records [Code].** Signals saved before the gate existed remain listed; the screen has fallbacks for "Date unknown" and "Source URL missing". A re-qualify command exists (`RequalifySocialSignalsCommand`); whether it has been run in production is [Unknown].

### 5.4 Company Identification — 60%

- Company, industry and location are read by the AI from the post text or search snippet [Code]. Snippets are often one or two lines, so naming is only as good as the snippet.
- Companies are de-duplicated by normalised name + location [Code].
- A signal can be attributed to an "individual" rather than a company [Code]; the spec is company-event based.

### 5.5 People Identification — 50%

- People named in the post are extracted as a list of names [Code]. No job titles.
- If no one is named, the system uses the **post's author** as the person to enrich [Code]. For a news item or a commentator's post, that is not a decision-maker at the company.

### 5.6 Contact Enrichment — 35%

**Working**
- A real multi-step lookup: web snippets and website crawl → Bytemine/Cleanlist → Apollo/Hunter (`ContactEnrichmentOrchestrator`) [Code].
- Every attempt is logged per person with provider and tier (`EnrichmentLog`) [Code].
- Role-based search by the ICP's target roles when no person is named (`RoleBasedContactSearch`) [Code].
- Three clear states on each signal; failures are recorded as "not found", not left blank [Code].

**Gaps**
- **Contact details are found and then lost [Code].** After a scan, `EnrichSocialSignalJob` → `enrichSignalOnly()` runs the lookup but discards the returned email, phone and LinkedIn; only "found email: yes/no" is logged. Later, "Add to CRM" (`SignalToLeadService::convert`) sees the signal is already marked as enriched and **skips the lookup**, so the CRM lead is created without the contact. Provider credits are spent and the user never receives the result.
- **The API cannot return contact details for a signal [Code].** `SocialSignalResource` exposes only `foundEmail` / `foundPhone` booleans — consistent with the above, there is nothing stored to return.
- **Role-based search needs Apollo, and returns nothing without it [Code].** If Apollo is not enabled the search exits without logging an attempt.
- **Provider plans [Unknown, with a warning].** `docs/paid_plans_for_the_owner.md` (28 Sept 2026) records: search account on a free plan with 181 failed searches for lack of credits; Apollo's search API refused on the free plan with 34 attempts and no contacts found; Hunter limited to 50 emails a month for all customers. If these were not upgraded, enrichment cannot meet the requirement regardless of code.

### 5.7 Lead Management — 75%

- Working: save to CRM (single/batch), pipeline choice, duplicate checks, dismiss, reminders, outreach drafts, pending-review page, learning from dismissals [Code].
- Gaps: no results table in the specified shape (Company | Signal | Territory | ICP Status | Contact | Contact Status); no export; signal type, source link and date are not clearly carried into the Factory23 CRM lead [Code].

---

## 6. Acceptance criteria from the spec

The backend's own plan (`docs/backend_implementation_plan.md`) scores four of these as met. This audit disagrees on three.

| # | Criterion | Backend plan says | This audit | Why |
| --- | --- | --- | --- | --- |
| 1 | No signal without source URL and date | Met | **Met for new scans** | Gate enforced in code. Older records may still be listed. |
| 2 | No signal older than the recency window | Met | **Partly** | Enforced, but against a fixed 30-day cap, not the event type's window. |
| 3 | Tagged by signal type, not generic topic | Partly | **Not met** | Most signals are untyped; failed type checks are kept as generic. |
| 4 | Every named person has an enrichment attempt logged | Met | **Partly** | Attempts are logged, but the result is not kept, and the fallback "person" is the post's author. |
| 5 | ICP fields never sent as free-text search | Met | **Partly** | Industries and territories still reach search text in both tabs. |

**1 met, 3 partly, 1 not met.**

## 7. "Important rules" from the Product Overview §6

| Rule | Status |
| --- | --- |
| No source URL → discard | Met (new scans) |
| No publication date → discard | Met (new scans) |
| Outside recency window → reject | Partly — 30-day cap |
| Company does not match ICP → do not qualify | **Not met in Social Listening** (filter always passes); partly in Smart Lead |
| General industry news with no company event → reject | Partly — AI gate rejects, but only for event-tagged posts is "event" the test |
| Event does not match selected type → reject | **Not met** — demoted to a generic signal |
| No named person → continue with company-level lead | Met |
| No enriched contact → save with "No contact found" | Mostly met — status exists; wording differs; not filterable |
| Different client → same architecture, new definitions | Mostly met in the backend (types are data); frontend packs hard-coded |

---

## 8. Next steps

### P0 — before the waiting client is onboarded

| # | Change | Where | Size |
| --- | --- | --- | --- |
| 1 | **Add a news source** (Serper `/news`, no `site:` restriction) and route all event-type queries to it first; keep social as secondary | new adapter in `app/Services/Intent/Adapters/`, register in `AppServiceProvider`, source routing in `SocialListeningOrchestrator::collectHits` | Medium |
| 2 | **Use each event type's own recency window** for event-tagged hits; raise the general cap; offer 30/90/180 in settings | `SocialListeningOrchestrator` (`MAX_FRESHNESS_WINDOW_DAYS`, the `groundingGate->admit` call), frontend `FreshnessWindowDays` | Small |
| 3 | **Make the ICP filter real in Social Listening**: pass the extracted industry and territory and the fields actually available; count rejections; honour `icp_filter_enabled` | `SocialListeningOrchestrator` near the `icpFilter->passes` call | Small |
| 4 | **Keep the contact that was found**: store email, phone, LinkedIn, role and provider on the signal; reuse them at CRM conversion; return them in the API; show them in the panel | `SignalToLeadService::enrichSignalOnly` / `convert`, `SocialSignalResource`, frontend `EnrichmentContact` + detail panel | Medium |
| 5 | **Split territory** into "company location" and "target market" and put the target market into event queries and the type check | ICP config (both apps), `IcpBrief`, `SignalQueryBuilder::placeHint`, `SignalExtractor` | Medium |
| 6 | **Reject on type mismatch** for event-tagged hits and report the real count | `SocialListeningOrchestrator` (the `! $detected->matched` branch, `typeMismatch`) | Small |
| 7 | **Confirm the paid plans** for search, Apollo and Hunter, and the production values of the scan budgets | Operations | — |

### P1 — to match the specified output

8. Give event queries their own budget instead of sharing 30 searches with buyer-intent queries; let an account run events only.
9. Stop the pre-filter from dropping job URLs/text for job-post event types.
10. Stop enriching the post's author for company events; use named people, then role-based search.
11. Results table: Company | Signal | Territory | ICP Status | Contact | Contact Status, filterable, with CSV export.
12. Run the re-qualify command (or hide) legacy signals with no link, date or type.
13. Load packs from `GET /signal-types` in the ICP builder; allow per-type selection; retire the ten legacy "intent signals" or map them to types.
14. Job title for named people.
15. Move `dev` up to `main` in the `sales-engine` repo.

### P2 — after launch

16. A firmographic data source so company size and revenue can be checked.
17. Bring Smart Lead onto the same event pipeline, or label it as company search.
18. Link verification; event date vs post date.
19. Carry signal type, source link and date into the Factory23 CRM lead.

### Still needed to close the audit

- **One live scan** with the waiting client's ICP, compared line by line with the requirement.
- **Production numbers**: the stored summaries of recent scans (checked / kept / rejected by reason / contacts found) and the provider plan status.
- **A test run** of both suites on a developer machine.
- **Product Owner confirmation** of the two working assumptions below.

### Working assumptions (proposed by the audit, not yet confirmed)

**Recency window.** Per event type, not one global number. The backend already stores 180 days for the four core types and 90 for complaints, outages and unfilled roles; the proposal is simply to honour those values, with the user able to shorten but not exceed them.

**"Hiring / job post" signal.**
- Trigger: a named company publishes a job posting for a role that is either (a) based in or responsible for the target market, or (b) in the function the client sells into.
- Must capture: company, role title, role location, posting URL, posting date.
- Valid: "ABC Manufacturing is hiring a Business Development Manager, Nigeria" on its careers page, dated within the window.
- Invalid: an article on hiring trends; a recruiter post that does not name the employer; a role outside the target market and function.
- It is the earlier, weaker form of Leadership Hire: a company-level lead with a role-based contact search, until a named person is appointed.

---

## 9. Evidence index

**Backend (`sales-engine/backend`, `origin/main`)**

| Finding | File |
| --- | --- |
| Scan pipeline, 30-search / enrich caps, 30-day cap | `app/Services/Intent/SocialListeningOrchestrator.php` (constants at top; `run()`; `collectHits()`) |
| ICP filter called with empty candidate | `app/Services/Intent/SocialListeningOrchestrator.php` — `$this->icpFilter->passes($brief, new CandidateCompany(industry: null, …), [])` |
| "Not evaluated → passes" rule | `app/Services/IcpFiltering/IcpFilterService.php` — `passes()` |
| Link + date + recency gate | `app/Services/SignalDetection/SignalGroundingGate.php` |
| Social-only sources | `app/Providers/AppServiceProvider.php` (SocialListeningOrchestrator binding); `app/Services/Intent/Adapters/AbstractSerperSocialAdapter.php` (`site:` clause, `/search`) |
| Event query construction | `app/Services/SignalDetection/SignalQueryBuilder.php` |
| Event definitions and windows | `database/seeders/SignalTypeDefinitionSeeder.php` |
| Per-type check, export direction, job watch | `app/Services/SignalDetection/SignalExtractor.php` |
| Mismatch demoted, `typeMismatch` = 0 | `app/Services/Intent/SocialListeningOrchestrator.php` — `if (! $detected->matched)` branch; `result_summary` |
| Job URLs/text blocked | `app/Services/Intent/OpportunityPrefilter.php` — `rejection()` |
| Buyer-intent final gate | `app/Services/Intent/OpportunityGate.php` |
| Enrichment result discarded; skipped at conversion | `app/Services/Intent/SignalToLeadService.php` — `enrichSignalOnly()`, `convert()` (`$alreadyEnriched`) |
| API exposes found-flags only | `app/Http/Resources/SocialSignalResource.php` |
| Role search depends on Apollo | `app/Services/Enrichment/RoleBasedContactSearch.php` |
| Budgets and defaults | `config/services.php` (`social_listening.*`), `.env.example` |
| Provider plan status (Sept 2026) | `docs/paid_plans_for_the_owner.md` |
| Backend's own scorecard | `docs/backend_implementation_plan.md` |

**Frontend (`the-factory`)**

| Finding | File and line |
| --- | --- |
| ICP fields, single territory list | `components/sales-engine/icp-builder-modal.tsx:53-73`, `:1412-1425` |
| Packs hard-coded | `components/sales-engine/icp-builder-modal.tsx:191-207` |
| Search text from brief → description → industries | `lib/sales-engine/icp-search-brief.ts:89-104` |
| Sources offered: social only | `components/sales-engine/sales-engine-view.tsx:356-362` |
| Legacy intent taxonomy | `components/sales-engine/sales-engine-view.tsx:364-399` |
| "Most signals … carry no discrete type key" | `components/sales-engine/sales-engine-view.tsx:4513-4514` |
| Window 7/14/30, clamped to 30 | `lib/api/sales-engine.ts:1569`, `components/sales-engine/sales-engine-view.tsx:4116` |
| "Date unknown" / "Source URL missing" | `components/sales-engine/sales-engine-view.tsx:3267`, `:3744`, `:3773` |
| ICP "Matched" line | `components/sales-engine/sales-engine-view.tsx:256-267`, `:3879-3886` |
| Enrichment display (flags only) | `lib/api/sales-engine.ts:1381-1395`, `components/sales-engine/sales-engine-view.tsx:3895-3945` |
| Signals table columns | `components/sales-engine/sales-engine-view.tsx:3494-3500` |
