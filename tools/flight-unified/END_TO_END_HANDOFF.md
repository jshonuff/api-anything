# JC-SAVAGE FLIGHT-1 — END-TO-END HANDOFF
**Scope:** Full flight integration history, architecture, source code, tests, constraints, current status, and exact continuation instructions.
**Issued:** October 30, 2026 (America/Chicago)
**Sender:** ChatGPT
**Operational recipient:** Claude via existing `jc_savage.ai_mailbox_send_handoff`; this document is also usable by another AI or Human JC.
**Governance:** Live JC-SAVAGE Supabase is authoritative; owner FLIGHT-1; Human JC is final approving authority. This is an evidence/handoff artifact, **not** a Supabase production activation or a claim that ChatGPT can execute the custom checker.

## 1. Human JC's exact outcome and communication preference

JC wants ONE consolidated comparison when asking for a flight, with **actual flight numbers, departure/arrival times, days, stops, prices, and cheapest totals**—without operating an application, maintaining servers, installing Tailscale, or repeated code/debug conversations.

Every eligible leg must compare:
- Frontier **GoWild** fare actually observable in Frontier booking data;
- Frontier **Discount Den** member fare;
- Frontier **Standard** cash fare;
- **Google Flights** cash alternatives, including other carriers.

For **city hopping**, e.g. MCI → Atlanta or Charlotte (6 days) → Dallas (2 days) → MCI, use **three one-way legs** and check each leg across all providers. Also evaluate reversing the stop order and origin choices MCI vs ICT. If start MCI, finish MCI; if start ICT, finish ICT. Total trip up to 10 days. Dallas DFW/DAL considered only where supported by actual results.

For a **true round trip**, e.g. MCI → ATL → MCI, compare a real **single round-trip ticket** against **two independently bought one-way fares**, including **all 3 × 3 = 9 Frontier outbound/return fare mixes**, and Google/other-carrier mixes. Do not assume a round-trip ticket equals two one-way prices.

Default traveler profile: **one adult**, free **under-seat personal item only**; **zero overhead carry-ons and zero checked bags**; eligible Elite Silver standard-seat benefit only where the fare rules permit. Don't add fees for unwanted bags or double-count source taxes/fees. Pass/Discount Den memberships are sunk costs for marginal-trip ranking, but their current entitlement must be verified before purchase.

**Critical instruction from JC:** Deliver the numbers. Do not route him through Codex, mobile gateway, localhost dashboard, or a series of technical decisions as the default answer. If an adapter fails, retain the separately working sources and identify uncertainty instead of inventing prices. No destructive replacement.

## 2. Canonical ownership and release controls (live verified)

Project ID: `vxubjwmiizjyrxuflxhu`. Live `jc_savage.travel_capabilities` and owners:
- `TX-CAP-004` Compare Flights — ACTIVE, SUPABASE_CANONICAL, primary owner FLIGHT-1.
- `TX-CAP-005` Compare Flight Strategies — ACTIVE, SUPABASE_CANONICAL, primary owner FLIGHT-1.

Live `jc_savage.workflow_execution_control` singleton checked during development:
`production_dispatch_enabled=false`, `claims_enabled=false`, `codex_writes_enabled=false`, `evidence_required=true`.

Live `jc_savage.travel_integrations`: `FRONTIER-DISCOUNT-DEN` ACTIVE (membership metadata; **not live fare verification**), `FLIGHTPOINTS` AVAILABLE, `SKYSCANNER` AVAILABLE. Treat external fares as source quotes, not canonical writes.

GitHub is development source/evidence, **not Supabase mutable canon**. No Supabase schema, production-control, deployment, booking, automatic monitoring, or membership changes were made during this development. Sending this handoff via the existing AI mailbox is a user-authorized communication write only; it does not grant implementation authority.

## 3. Source repositories and exact work locations

- **Working Frontier checker (preserved unchanged):** `jshonuff/api-anything` → `tools/gowild-check/gowild-check.js`. Pull from development branch `jc-savage/flight-unified-pilot-20261030`; upstream base `claude/frontier-gowild-github-review-wzeb3y`.
- **Unified pilot:** `https://github.com/jshonuff/api-anything/tree/jc-savage/flight-unified-pilot-20261030/tools/flight-unified`
- **Existing MUSE entry handoff:** `tools/flight-unified/MUSE_HANDOFF.md`
- **This comprehensive handoff:** `tools/flight-unified/END_TO_END_HANDOFF.md`
- **Python Google Flights implementation:** `jshonuff/fli`, pinned commit `62eaaed9925c6ea63a606ccdbb74be3040e45d66`.
- **Optional experimental JavaScript FLI:** `jshonuff/fli/fli-js`, built from pinned GitHub source (`fli-js@0.0.4` not published on npm).
- **Optional Eric Hansen Python SDK:** `ericchansen/flights`, pinned diagnostic commit `090f4247dc334aa8a6fc240fc0b7633fe4f962d8`, MIT.
- **Original Frontier dashboard for possible UI reuse:** `jshonuff/frontierGoWildFlightFinder`; DO NOT activate its duplicate bulk scraper.
- **GoWild Matcher:** `thecyberthriver/gowild-matcher`; ideas about freshness/alert dedupe only, not a source of copied unlicensed code.

## 4. What was actually built, in sequence

### A. Existing GoWild checker and research
Inspected 20+ GoWild-related GitHub projects; preferred preserving the working `gowild-check.js` rather than replacing it. Its HTTP flow fetches Frontier `booking.flyfrontier.com/Flight/InternalSelect`, carries redirect cookies, extracts embedded escaped `FlightData`, dedupes itineraries, records flight number/route/date/time/stops and `goWildFare`, `discountDenFare`, `standardFare`. GoWild sentinel `-1` = **NO_SEAT**, not a price. Failed, blocked, captcha, missing data, network/timeouts = **UNKNOWN**, not sold-out. Default pacing 20s, max 12 route/date searches; script accepts a lower 10s override (known maintenance gap, but original checker remains unchanged).

### B. First integrated development pilot
Created `tools/flight-unified/normalize.mjs`, `run.mjs`, `eric_bridge.py`, `alerts.mjs`, `bootstrap-fli.sh`, `normalize.test.mjs`, `package.json`, README and CI. Normalizes provider-attributed prices, validates the baggage profile, and computes all nine Frontier outbound/return combinations. The orchestrator runs each source independently, isolates errors and uses temporary files. `alerts.mjs` creates **local unsent candidates**; it does not send notifications.

First three-provider live run: Frontier **4** observed flights; TypeScript FLI-JS **0**, Eric Python SDK **0**. Distinct diagnostics: FLI-JS received a Google response but parsed no flight rows; Eric received **HTTP 200 text/html** at its JSON configuration endpoint, producing `JSONDecodeError`. Unknown source results did not erase Frontier fares. Do not misstate these two experimental sources as verified.

### C. Working Google FLI Python fallback
Tested original Python `fli.search.SearchFlights` independently: **23 live flight results** on generic DEN → LAS. Integrated `fli_python_bridge.py`; `run.mjs --fli` now means proven Python FLI, while `--fli-js` remains experimental. Generic live combined run returned **Frontier 5 observations + Google FLI 23 results, zero provider errors**. All combinations still have to be independently checkout-validated.

### D. Local comparison UI and optional local server (NOT REQUIRED BY JC)
Added `compare-ui.mjs` with exact cross-provider dedupe (Frontier `FR` ↔ `F9` alias, route/date/flight/departure identity; no dangerous route-only merges), provenance labels and **human-entered checkout delta**, never an automatic booking claim. Added `dashboard/index.html`, `app.mjs`, `style.css`, `demo.mjs`, `ui-smoke.mjs`. Added `local-search.mjs`, `local-server.mjs`, `start-local.mjs`, `setup-local.sh`; only localhost requests, no remote/public deployment; optional Python virtual environment, inputs validated. Synthetic Chromium UI testing passed.

### E. Optional Tailscale private iPhone path (NOT DEPLOYED; NOT WANTED AS DEFAULT)
Added `tailnet-gateway.mjs`, `start-tailnet.mjs`, `tailnet-gateway.test.mjs`, `tailnet-mobile-smoke.mjs`; simulated Tailscale Serve identity, host and origin checks. 30/30 test suite and a mocked iPhone-sized browser test passed. **No real iPhone tailnet activation was done.** JC rejected this workflow as unnecessary overhead. Preserve as optional historical development code only; **do not ask JC to use or set it up to get fares**.

### F. Final consolidated itinerary and fare-strategy work
Added `trip-core.mjs` (pure comparison/validation), `trip-core.test.mjs`, `trip.mjs` (one entrypoint for 1–5 sequential flight legs), and `fli_roundtrip_bridge.py` (genuine Google round-trip search, not simply two independent one-way amounts). `trip.mjs` invokes the existing `run.mjs --fli` for EACH leg, then if it is two-leg reciprocal, executes separate FLI round-trip search. `trip-core.mjs` compares `gowild`, `discount_den`, `standard`, `google_cash`, and preserves source/checkout confidence; `mustReturnHome:true` enforces origin=final airport. Added a `--no-frontier` safeguard in the unified runner to avoid repeating Frontier queries after an unreadable/blocked leg; Google results can continue independently.

After correcting missing `FlightSearchFilters.trip_type=TripType.ROUND_TRIP`, one generic round-trip probe returned **15 priced Google round-trip search candidates**; whether second-leg price is truly full-ticket checkout total remains **UNVERIFIED**. A further generic live integrated run returned **25 Frontier flight records**, **19 GoWild-populated**, **25 Discount Den-populated**, **25 Standard-populated** and **159 Google cash results**, together. This is source retrieval proof, not proof of member-specific checkout access or bookability. Expanded offline strategy test suite: **36/36 passed** at time of recorded evidence.

### G. Direct ordinary-ChatGPT dispatch attempts and limits
The connected GitHub tool in this chat allows repository read/edit and Actions log inspection but **does not expose arbitrary workflow dispatch or local shell execution**. Another verified Supabase travel portal existed but did **not** execute the two flight providers; production dispatch remained OFF. No genuine direct ChatGPT-to-private-trip execution has been verified. **Do not imply that a price checked through Skyscanner/Trip.com came from our GoWild checker.** JC expects the integration to run when asked, but this is the remaining execution/permissions gap, not a failure of combining source code.

### H. November 2026 user itinerary example
Request: depart MCI or ICT, visit ATL or CLT ~6 days, Dallas ~2 days, total ≤10 days, finish at same starting airport, either city order. Live publicly accessible Trip.com/Skyscanner fare searches were used because the custom checker was not callable on demand in chat. Examples were: Nov 16–24 MCI → CLT → DFW → MCI ~**$362** three cash one-ways; MCI → ATL → DFW → MCI ~**$404**, both indicative and source-specific. Some results involve overnight or self-transfer and need screening; pricing has changed since retrieval. **GoWild was NOT independently verified for those specific November legs.** Never insert these historical quote numbers into the canonical fare engine or claim currently bookable tickets.

## 5. Current technical files: owner responsibilities

| File | Responsibility |
|---|---|
| `../gowild-check/gowild-check.js` | Sole verified Frontier booking-page observation source for GoWild/Den/Standard; **unchanged** |
| `run.mjs` | Existing single-pair/one-way Frontier + FLI Python adapter and provider isolation |
| `fli_python_bridge.py` | Pinned Google Flights Python cash one-way results |
| `normalize.mjs` | Source attribution, fares, status, 9 Frontier pairings |
| `trip.mjs` | **Single developer entrypoint** for city-hop legs or reciprocal trip |
| `trip-core.mjs` | Fare comparisons, route continuity, same-home rule |
| `fli_roundtrip_bridge.py` | Separate 2-segment Google round-trip ticket search, checkout interpretation pending |
| `compare-ui.mjs` + `dashboard/` | Optional local visual readout, NOT required in user flow |
| `alerts.mjs` | Unsent freshness-qualified alert candidates |
| `eric_bridge.py`, `--fli-js` | Experimental optional providers not live-ready |
| `.github/workflows/flight-unified-ci.yml` | Deterministic syntax and offline tests |
| `MUSE_HANDOFF.md` | Existing shorter multi-AI handoff |
| `END_TO_END_HANDOFF.md` | This full history and recipient instructions |

## 6. Evidence — exact GitHub Actions URLs

1. First live three-provider partial probe: https://github.com/jshonuff/api-anything/actions/runs/41078251090
2. Isolated adapter diagnostics (FLI-JS parser / Eric HTML): https://github.com/jshonuff/api-anything/actions/runs/41084331331
3. Original Python Google FLI 23 flights: https://github.com/jshonuff/api-anything/actions/runs/41084588061
4. Combined Frontier 5 + Python FLI 23: https://github.com/jshonuff/api-anything/actions/runs/41085302160
5. Dashboard 18/18 offline: https://github.com/jshonuff/api-anything/actions/runs/41112786143
6. Chromium synthetic dashboard: https://github.com/jshonuff/api-anything/actions/runs/41113159289
7. Local search server 24/24 offline: https://github.com/jshonuff/api-anything/actions/runs/41119979692
8. Tailnet safety 30/30 offline: https://github.com/jshonuff/api-anything/actions/runs/41123359355
9. Simulated mobile browser: https://github.com/jshonuff/api-anything/actions/runs/41123376431
10. Final trip strategy 36/36 offline: https://github.com/jshonuff/api-anything/actions/runs/41160540472
11. Corrected Google true round-trip 15 priced rows: https://github.com/jshonuff/api-anything/actions/runs/41160715011
12. Four fare categories together: https://github.com/jshonuff/api-anything/actions/runs/41160766359

GitHub source is preserved on **development branch** `jc-savage/flight-unified-pilot-20261030`, not merged into `main`; the original standalone checker was not changed.

## 7. Reproduction by another AI / MUSE or Claude

No changes to architecture or setup are required. Use existing repo, authorized executor, exact branch.

One-time Python dependency **in execution environment**, not on Human JC's phone:
```sh
bash tools/flight-unified/setup-local.sh
```

Test locally without any airline calls:
```sh
node --test tools/flight-unified/normalize.test.mjs tools/flight-unified/compare-ui.test.mjs tools/flight-unified/local-server.test.mjs tools/flight-unified/tailnet-gateway.test.mjs tools/flight-unified/trip-core.test.mjs
```

Single-route combined (only developer/authorized runtime, search pace limited):
```sh
FLI_PYTHON=tools/flight-unified/.venv/bin/python node tools/flight-unified/run.mjs DEN LAS 2026-11-02 --fli
```

Example **three separate one-way legs** (`/private/itinerary.json` — not in public GitHub):
```json
{"legs":[{"from":"MCI","to":"ATL","date":"2026-11-16"},
{"from":"ATL","to":"DFW","date":"2026-11-22"},
{"from":"DFW","to":"MCI","date":"2026-11-24"}],
"mustReturnHome":true,"nonstop":false}
```
```sh
FLI_PYTHON=tools/flight-unified/.venv/bin/python node tools/flight-unified/trip.mjs /private/itinerary.json > /private/trip-result.json
```

For **actual round trip** submit exactly two reciprocal legs and the engine queries BOTH the independent one-way fares and Google two-segment round-trip reference. The output `FLIGHT1_UNIFIED_TRIP_V1` includes `comparison.bestIndependentMix`, `comparison.strategies`, `comparison.legs`, and provider problems. No booking is performed.

Security: Use generic routes in public CI, never commit JC's itinerary queries, cookies, account sessions, credentials, seat entitlements, raw booking responses or member-specific fares to public Actions. Don't run repeated Frontier sessions near block/captcha. Use a private existing authorized execution path; no public unauthenticated endpoint.

## 8. Precise unresolved items and continuation

**Verified:** Original Frontier direct source; original Google FLI Python source; combined live retrieval of four fare categories; 9-way comparison logic; individual-city-hop leg logic; reciprocal true round-trip search returning priced results; original GoWild untouched; documented code and unit tests.

**Not yet verified / not done:** (a) live end-to-end multi-leg `trip.mjs` with real itinerary, (b) direct invocation of that code in an ordinary ChatGPT conversation through an authorized connected execution service, (c) final checkout accuracy and GoWild booking window/seat entitlement, (d) independent proof the FLI round-trip returned quote represents complete same-itinerary booking price, (e) reliable support of DFW vs DAL and self-transfer / overnight screening, (f) no claims of production deployment, mobile setup, dispatch, alerts, or bookings.

**Next owner action:** Identify and use the **already-approved runtime owner** able to execute this exact GitHub code, without new architecture. Prove ONE low-volume end-to-end trip search, separately validate a true round-trip checkout, and then make the single report accessible in regular chat to provide numbers. Retain provider failures as UNKNOWN. Route any production authority proposal through live FLIGHT-1 governance and Human JC.

**Mail routing note:** Supabase AI mailbox lists `muse` with `metadata.retired_by=HUMAN_JC` and `retirement_reason='Internal Supabase mailbox Muse integration no longer used'`; do not silently resurrect the old internal MUSE transport. Use an existing active mailbox recipient such as Claude for operative cross-AI handoff, with this repository file usable by MUSE externally. Sending a mailbox handoff creates **no authority effect** and does not autonomously run a provider.

## Definition of done

Human JC asks for a flight in ordinary conversation → **existing** authorized execution invokes Frontier booking data and Google Python FLI → all applicable GoWild / Discount Den / Standard / Google options checked → for multi-city, price all one-way legs; for return, price **single ticket vs two one-ways** → show real sourced prices, flight numbers, schedules, stop risks, eligibility and cheapest total → mark unverified observations as UNKNOWN → no demand that JC write code, install services or manage a dashboard.
