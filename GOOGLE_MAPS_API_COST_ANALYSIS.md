# Google Maps Platform — Cost Control & Feature Roadmap

**Prepared for:** Management / Finance Review
**Product:** The Factory — Field Operations & Live Agent Tracking Platform
**Scope:** Google Places API (current usage) + recommended Google Maps Platform expansions
**Pricing basis:** Google Maps Platform pricing model effective **1 March 2025** (still current), global (non‑India) USD list prices, per 1,000 API calls ("per 1,000 billable events")

> **One‑line summary:** Today we use Google only for **place search and map points‑of‑interest (POIs)**; map rendering, directions and geocoding all run on Mapbox. At our current early scale this Google usage is effectively **$0–$150/month** thanks to Google's free monthly allowances. Two configuration choices in our code push us into Google's most expensive billing tiers, and fixing them can cut the Google bill by **60–75%** as we scale — before we add any new features.

---

## 1. Executive Summary

| Topic | Finding |
|---|---|
| **What we use Google for today** | Place **Autocomplete** (address/business search), **Place Details** (coordinates of the selected place), and **Nearby Search** (POI pins on the map). |
| **What we do *not* use Google for today** | Map display, turn‑by‑turn directions/ETA, and geocoding all currently run on **Mapbox** (a separate vendor). Google map rendering only switches on if an administrator changes the map provider to "Google". |
| **Current cost exposure** | ~**$120/month** at pilot scale, rising to ~**$2,000/month** (growth) and ~**$11,300/month** (large scale) **if left unoptimised**. |
| **Key cost risk #1** | Our **Place Details** request asks for the business *display name*, which forces billing at the **Pro** tier ($17 per 1,000) instead of **Essentials** ($5 per 1,000) — a 3.4× markup we do not need, because we already have the name from the search step. |
| **Key cost risk #2** | Our **Nearby Search** asks for phone numbers and opening hours, forcing the **Enterprise** tier ($35 per 1,000), and it fires **3 calls per map refresh**. This is our single biggest cost multiplier. |
| **Optimisation upside** | Applying the fixes in Section 6 reduces the projected Google bill by roughly **75% at growth scale** and **64% at large scale**, with **no loss of user‑facing functionality**. |
| **Growth opportunities** | Google's **Routes API** (traffic‑aware ETA), **Roads API** (accurate GPS trails for our tracking feature), and **Route Matrix** (smart nearest‑agent dispatch) would materially improve reliability and durability. Costs and benefits are detailed in Section 7. |

---

## 2. How Google Maps Platform Billing Works (2025 Model)

Understanding three rules explains our entire bill:

1. **You pay per API call, grouped into "SKUs."** Every distinct capability (Autocomplete, Place Details, Nearby Search, Directions, etc.) is a separate billable line item ("SKU"), priced **per 1,000 calls**.

2. **Each SKU has its own free monthly allowance** (this replaced the old flat "$200/month credit" in March 2025). The allowance resets on the 1st of each month:
   - **Essentials** SKUs: **10,000 free calls/month**
   - **Pro** SKUs: **5,000 free calls/month**
   - **Enterprise** SKUs: **1,000 free calls/month**
   - New Google Cloud customers also receive a one‑time **$300 free trial credit**.

3. **You are billed at the *highest* tier your request touches.** Google Places lets us request specific data "fields." If a request mixes cheap fields (e.g. an address) with one expensive field (e.g. a phone number), **the entire call is charged at the expensive tier.** This is the rule that quietly inflates our current bill (see Section 5).

**Volume discounts** apply automatically as usage grows (the per‑1,000 price steps down at 100k, 500k, 1M and 5M calls/month). No negotiation is required.

---

## 3. Current Implementation — What We Actually Call

All Google Places calls are routed through our **own server** (the API key is never exposed to the browser). Google is always tried first; if it returns nothing, we automatically fall back to Mapbox.

| # | Google capability | Where it is used in the product | How often it fires | Client/Server |
|---|---|---|---|---|
| 1 | **Places Autocomplete** | Address & business search box in: (a) "Create Task" on the management dashboard, (b) destination & origin search in the Agent mobile app (PWA) | Once per **keystroke** while the user types (subject to the throttling in Section 4) | Server proxy |
| 2 | **Places Details** | Immediately after the user *selects* a suggestion, to get its exact coordinates | Once per completed search (one per selection) | Server proxy |
| 3 | **Places Nearby Search** | POI pins (restaurants, banks, pharmacies, etc.) drawn on the map as the user pans/zooms | **3 calls per map refresh** (we query 3 category groups) | Server proxy |
| 4 | **Maps JavaScript API (map display)** | Only loads if an admin switches the map provider from Mapbox to Google | Once per map session — **not active by default** | Client |
| 5 | **Places Text Search** | Implemented in code but **not currently called** anywhere | Zero today | Server proxy |

> **Everything else** — the interactive map itself, route lines, turn‑by‑turn ETA, and address‑to‑coordinate geocoding — currently runs on **Mapbox**, not Google. That is why our Google bill today is limited to search and POIs.

---

## 4. Cost Controls Already in Place

The engineering team has already implemented several industry‑standard cost safeguards:

| Control | Effect |
|---|---|
| **Session tokens** on Autocomplete → Place Details | Groups a full "type‑then‑select" search into one billable session, so extra keystrokes after the 12th in a session are **free**. |
| **Server‑side proxy** for all Places calls | Protects the API key and centralises all usage for monitoring/limiting. |
| **300 ms debounce** on the dashboard "Create Task" search | Waits for a typing pause before calling Google, avoiding a call on every single letter. |
| **Field masks** on every request | We only request the specific data fields we need (this is good practice — but see Section 5, where two fields are more expensive than necessary). |
| **Map POI gating** | Nearby Search only fires at **zoom level 12 or closer**, with a **700 ms debounce**, a **maximum radius cap**, a "map area too large" skip, and cancellation of in‑flight requests when the user keeps panning. |
| **Result caps** | Nearby Search is capped at 80 results; radius capped at 5 km. |
| **Automatic Mapbox fallback** | If Google returns empty, we fall back to Mapbox rather than retrying Google. |

---

## 5. Where Our Current Bill Is Higher Than It Needs to Be

Two implementation details trigger Google's premium tiers. **Both are fixable without removing any feature the user sees.**

### 5.1 Place Details is billed at "Pro" instead of "Essentials" — 3.4× overcharge

Our Place Details request asks for these fields:
`id, displayName, formattedAddress, location, types, viewport`

Five of these six fields are **Essentials‑tier** ($5 per 1,000). But **`displayName`** is a **Pro‑tier** field. Because Google bills at the highest tier in the request, **every Place Details call is charged at Pro = $17 per 1,000** instead of Essentials = $5 per 1,000.

**Why this is avoidable:** We already receive the place's name from the *Autocomplete* step (the suggestion the user tapped). We do not need Google to send the name a second time. Removing `displayName` from Place Details drops the call to **Essentials ($5)** — a **70% reduction** on this line item.

### 5.2 Nearby Search is billed at "Enterprise" **and** fires 3× per refresh

Our Nearby Search request asks for:
`id, displayName, formattedAddress, location, types, internationalPhoneNumber, regularOpeningHours`

The last two fields — **`internationalPhoneNumber`** and **`regularOpeningHours`** — are **Enterprise‑tier** fields, forcing the whole call to **Nearby Search Enterprise = $35 per 1,000** (versus **Pro = $32 per 1,000**).

On top of that, each POI refresh runs **3 separate Nearby Search calls** (one for food, one for shops, one for services). So one map refresh = **3 × $35/1,000 = $0.105**, and this repeats every time the user pans or zooms above zoom 12.

**Why this is avoidable:**
- Dropping phone + opening hours (rarely shown on map pins) moves us from Enterprise → Pro.
- Consolidating the 3 category calls into 1 (or 2) roughly **cuts this line item by 50–66%**.

### 5.3 The mobile app search has no typing delay

The dashboard search waits 300 ms before calling Google; the **Agent mobile app (PWA) calls Google on every keystroke** with no delay. A user typing "Ikeja City Mall" can generate 15+ Autocomplete calls instead of ~3. Adding the same 300 ms debounce the dashboard already uses cuts mobile Autocomplete volume by roughly 40%.

---

## 6. Cost Projections — Current vs. Optimised

Because I do not yet have access to our live Google Cloud billing export, the figures below are **modelled** from three transparent scale scenarios. Management can replace the volume assumptions with real numbers from the Google Cloud Console (see Section 9).

### 6.1 Volume assumptions

| Driver (per month) | Pilot | Growth | Large |
|---|---:|---:|---:|
| Completed address searches (search → select) | 2,000 | 20,000 | 150,000 |
| Autocomplete keystroke calls (≈5 per search, current) | 10,000 | 100,000 | 750,000 |
| Place Details calls (1 per selection) | 2,000 | 20,000 | 150,000 |
| Map POI refreshes | 1,500 | 15,000 | 80,000 |
| Nearby Search calls (**×3 per refresh, current**) | 4,500 | 45,000 | 240,000 |

### 6.2 Current implementation — projected monthly Google cost

| SKU (current tier) | Pilot | Growth | Large |
|---|---:|---:|---:|
| Autocomplete Requests ($2.83 → volume‑tiered, 10k free) | $0 | $254.70 | $1,587.70 |
| Place Details **Pro** ($17 → tiered, 5k free) | $0 | $255.00 | $2,295.00 |
| Nearby Search **Enterprise** ($35 → tiered, 1k free) | $122.50 | $1,540.00 | $7,385.00 |
| **Total (current)** | **≈ $122** | **≈ $2,050** | **≈ $11,268** |

### 6.3 Optimised implementation — same functionality, lower tiers

Applying Section 5 (name reused from search → Place Details **Essentials**; drop phone/hours → Nearby **Pro**; 3 category calls → 1; mobile debounce → ~3 Autocomplete calls per search):

| SKU (optimised tier) | Pilot | Growth | Large |
|---|---:|---:|---:|
| Autocomplete Requests (≈3 per search) | $0 | $141.50 | $1,049.20 |
| Place Details **Essentials** ($5, 10k free) | $0 | $50.00 | $650.00 |
| Nearby Search **Pro** ($32, 5k free, 1 call/refresh) | $0 | $320.00 | $2,400.00 |
| **Total (optimised)** | **≈ $0** | **≈ $512** | **≈ $4,099** |
| **Monthly saving** | — | **≈ $1,538 (75%)** | **≈ $7,169 (64%)** |

> **Takeaway:** At pilot scale we are essentially free either way. As volume grows, the optimisations in Section 5 are worth **$1,500–$7,000+ per month** with zero change to what the user sees.

---

## 7. Recommended Additional Google Features (Integrity & Durability)

These are Google capabilities we do **not** use yet. They would make the tracking product more accurate, more reliable, and less dependent on a single map vendor. Each entry lists the business benefit, the Google SKU, the free allowance, and an **illustrative incremental cost at "Growth" scale**.

### 7.1 High‑value (directly improve the tracking product)

| Feature | What it adds | Google SKU | Price (per 1,000) | Free/month | Illustrative Growth‑scale cost |
|---|---|---|---|---:|---:|
| **Routes API — Compute Routes** | Traffic‑aware ETA and turn‑by‑turn for live tracking (accurate "arrives in X min"). Replaces/augments the current Mapbox directions. | Compute Routes **Essentials** / **Pro** (traffic) | $5 (Ess.) / $10 (Pro) | 10,000 (Ess.) / 5,000 (Pro) | ~$100 (Ess.) – $250 (Pro) |
| **Roads API — Snap to Roads** | Cleans raw GPS breadcrumbs so the live trail follows real roads (removes the "zig‑zag" and off‑road jumps in our tracking map). Directly strengthens the feature set we recently stabilised. | Roads – Nearest Road / Route Traveled | $10 | 5,000 | ~$150 |
| **Routes API — Compute Route Matrix** | "Nearest available agent" dispatch — ranks candidate agents by real driving time to a new task, reducing travel time and fuel. | Compute Route Matrix **Essentials** / **Pro** | $5 (Ess.) / $10 (Pro) | 10,000 (Ess.) / 5,000 (Pro) | ~$25–$100 |
| **Roads API — Speed Limits** | Flags speeding for driver‑safety / compliance reporting. | Roads – Speed Limits | $20 | 5,000 | Optional / usage‑based |

### 7.2 Supporting / optional enhancements

| Feature | What it adds | Google SKU | Price (per 1,000) | Free/month | Notes |
|---|---|---|---|---:|---|
| **Geocoding API** | Server‑side address ↔ coordinates. Would consolidate onto Google (currently Mapbox). | Geocoding | $5 | 10,000 | Vendor consolidation, not new capability |
| **Static Maps API** | Lightweight map thumbnails in emails, PDF reports, notifications and task cards — far cheaper than loading an interactive map. | Static Maps | $2 | 10,000 | Cheapest way to show "where" without an interactive map |
| **Maps JavaScript API (Dynamic Maps)** | Only if we decide to standardise map rendering on Google instead of Mapbox. | Dynamic Maps | $7 | 10,000 | Not recommended unless we drop Mapbox |
| **Address Validation API** | Validates/standardises customer addresses at task creation to cut failed/wrong‑address visits. | Address Validation | ~$17 | (verify in console) | Fewer wasted trips |
| **Place Photos** | Show a photo of the destination business in the app. | Place Photos | $7 | 1,000 | UX polish |
| **Places Text Search** (already coded, unused) | Free‑text business search ("pharmacies near Ikeja"). | Text Search **Pro** | $32 | 5,000 | Enable only if a real use case appears |

### 7.3 Illustrative "durability suite" incremental cost (Growth scale)

Adopting the high‑value trio (traffic‑aware ETA + snap‑to‑roads trails + nearest‑agent dispatch) plus static‑map thumbnails adds roughly:

| Add‑on | Est. monthly (Growth) |
|---|---:|
| Compute Routes (traffic‑aware ETA) | ~$250 |
| Roads – Snap to Roads (clean trails) | ~$150 |
| Compute Route Matrix (dispatch) | ~$25 |
| Static Maps (report/notification thumbnails) | ~$40 |
| **Estimated add‑on total** | **≈ $465/month** |

> This ~$465/month is **more than fully offset** by the ~$1,538/month saved from the Section 5 optimisations — i.e. we can add all four durability features **and still reduce the overall Google bill** versus today's unoptimised implementation.

---

## 8. Recommended Roadmap

| Phase | Action | Effort | Financial impact |
|---|---|---|---|
| **1 — Quick wins** | Reuse the search name so Place Details drops Pro → **Essentials**; remove phone/opening‑hours so Nearby drops Enterprise → **Pro**; add the 300 ms debounce to the mobile app. | Low (config/field‑mask edits) | **−60–75%** of Google bill at scale |
| **2 — Reduce POI multiplier** | Consolidate the 3 Nearby category calls into 1–2; consider caching POIs per area for a few minutes. | Low–Medium | Further cuts the largest line item |
| **3 — Governance** | Turn on **budget alerts** and **per‑SKU daily quota caps** in Google Cloud Console; export billing to review actual SKU volumes monthly. | Low | Prevents bill surprises |
| **4 — Durability features** | Add Routes (traffic ETA), Roads (snap‑to‑roads trails), Route Matrix (dispatch), Static Maps (thumbnails). | Medium | +~$465/mo (Growth), offset by Phase 1 savings |
| **5 — Vendor strategy** | Decide whether to consolidate map rendering/directions/geocoding onto one vendor (Google or Mapbox) for simpler ops and billing. | Strategic | Neutral‑to‑positive |

---

## 9. Assumptions, Caveats & How to Validate

- **Prices** are Google's public global (non‑India) list prices under the March 2025 model, in USD per 1,000 calls. Actual invoices apply automatic volume discounts and any negotiated enterprise rates.
- **Volumes** in Section 6 are modelled scenarios, **not** measured usage. To calibrate, pull real per‑SKU call counts from **Google Cloud Console → Google Maps Platform → Metrics**, and enable **Billing → Reports / Budgets & alerts**.
- **Free allowances are per SKU and reset monthly.** At low volume, several line items are genuinely **$0**.
- The **map‑display (Dynamic Maps) cost is $0 today** because the app renders with Mapbox; it only applies if the provider is switched to Google.
- Recommended safeguards to set **before** scaling: (1) a monthly **budget alert**, (2) **daily quota caps** per Places SKU, (3) confirm all Places keys are **restricted** to our server/domains.

---

## 10. Appendix — Reference Price Tables (USD per 1,000 calls)

Columns are Google's automatic volume‑discount tiers by monthly call count.

### Places API (New)

| SKU | Free/mo | 0–100k | 100k–500k | 500k–1M | 1M–5M | 5M+ |
|---|---:|---:|---:|---:|---:|---:|
| Autocomplete Requests | 10,000 | $2.83 | $2.27 | $1.70 | $0.85 | $0.21 |
| Autocomplete Session Usage (13th+ call in a session) | Unlimited | $0 | $0 | $0 | $0 | $0 |
| Place Details Essentials | 10,000 | $5.00 | $4.00 | $3.00 | $1.50 | $0.38 |
| Place Details **Pro** *(current)* | 5,000 | $17.00 | $13.60 | $10.20 | $5.10 | $1.28 |
| Place Details Enterprise | 1,000 | $20.00 | $16.00 | $12.00 | $6.00 | $1.51 |
| Nearby Search Pro | 5,000 | $32.00 | $25.60 | $19.20 | $9.60 | $2.40 |
| Nearby Search **Enterprise** *(current)* | 1,000 | $35.00 | $28.00 | $21.00 | $10.50 | $2.63 |
| Text Search Pro | 5,000 | $32.00 | $25.60 | $19.20 | $9.60 | $2.40 |
| Place Photos | 1,000 | $7.00 | $5.60 | $4.20 | $2.10 | $0.53 |

### Maps, Routes, Roads & Geocoding

| SKU | Free/mo | First paid tier (per 1,000) | Notes |
|---|---:|---:|---|
| Maps JavaScript — Dynamic Maps | 10,000 | $7.00 | Interactive map load (not used by default) |
| Static Maps | 10,000 | $2.00 | Non‑interactive image |
| Geocoding | 10,000 | $5.00 | Address ↔ coordinates |
| Routes — Compute Routes Essentials | 10,000 | $5.00 | Standard route/ETA |
| Routes — Compute Routes Pro | 5,000 | $10.00 | Traffic‑aware / advanced |
| Routes — Compute Route Matrix Essentials | 10,000 | $5.00 | Per element (origins × destinations) |
| Routes — Compute Route Matrix Pro | 5,000 | $10.00 | Traffic‑aware matrix |
| Roads — Nearest Road / Route Traveled | 5,000 | $10.00 | Snap GPS to roads |
| Roads — Speed Limits | 5,000 | $20.00 | Compliance/safety |

*Prices verified against Google's public pricing pages (developers.google.com/maps/billing-and-pricing/pricing and mapsplatform.google.com/pricing) under the pricing model effective 1 March 2025. Confirm current rates and India pricing in the Google Cloud Console before finalising budgets.*
