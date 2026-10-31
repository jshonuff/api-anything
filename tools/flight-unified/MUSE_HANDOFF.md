# MUSE HANDOFF — JC-SAVAGE FLIGHT-1 (single flight comparison)

**Human request:** Stop making separate applications. The user wants to ask for flights in ordinary conversation, then receive actual **dates, flight numbers, departure/arrival times, stops, each fare and a cheapest total**. The engines should be combined behind ONE comparison report. No user-facing setup, Tailscale, dashboards, Codex instruction loops or more architectural detours.

**Authority:** Live Supabase = canonical for mutable JC-SAVAGE state; owner **FLIGHT-1** (Compare Flights `TX-CAP-004`, Compare Flight Strategies `TX-CAP-005`). Human JC approves. GitHub is source/delivery evidence, not the canonical operations database. Do not turn on production dispatch or make Supabase schema changes merely to compare flights.

## Repository and actual state

- Repo: `jshonuff/api-anything`
- Development branch: `jc-savage/flight-unified-pilot-20261030`
- Folder: `tools/flight-unified/`
- Existing untouched Frontier source: `tools/gowild-check/gowild-check.js`
- Working original Google source: `jshonuff/fli` pinned Python commit `62eaaed9925c6ea63a606ccdbb74be3040e45d66`
- Existing `run.mjs`: **ONE AIRPORT PAIR, ONE DATE** with both sources (Google via `--fli`). Reads Frontier GoWild, Discount Den and Standard price fields; Google cash fare search. Full live proof October 30: Frontier 5 flight records, Google 23 results on generic test route, both in one run: https://github.com/jshonuff/api-anything/actions/runs/41085302160
- NEW `trip.mjs` and `trip-core.mjs`: multi-leg wrapper + fare strategy. `trip.mjs` calls the EXISTING `run.mjs` for each leg and a distinct Google round-trip search for true round trips. **Do not replace** the working retrieval adapters.
- NEW `fli_roundtrip_bridge.py`: a separate cash round-trip search using the Python FLI `SearchFlights` two-segment protocol. Returned aggregate interpretation and checkout price are **not yet independently live reconciled**.
- Source and ordering tests: `trip-core.test.mjs`; automated GitHub CI `.github/workflows/flight-unified-ci.yml`.

## User-facing search policy — nonnegotiable

**Always compare three Frontier products plus Google:**
1. `gowild`: GoWild pass fare from **Frontier's own booking-page flight data**. Needs actual fare (not `-1` sentinel). Outside domestic booking window (normally day before) or on blackout/blocked day, label **UNKNOWN / NOT YET VERIFIED**, not sold out. Earlier bookable special offers can exist. Pass and eligibility still require checkout.
2. `discount_den`: Frontier Discount Den member fare field; verify live membership entitlement and total.
3. `standard`: Frontier standard cash fare.
4. `google_cash`: Google Flights cash-fare comparison (not itself proof of a Frontier GoWild seat). Do not assume Google values include identical fees, fare bundles or ancillary services.

Traveler profile: 1 adult, **one free under-seat personal item**, 0 overhead carry-ons, 0 checked bags. Do not add bag fees user will not incur. Standard seat for Silver only where eligible. Do not double-count taxes already in a source fare. Pass and Discount Den subscription charges are sunk costs for a marginal-trip comparison.

**City hop / open jaw (e.g., HOME → A → Dallas → HOME):** each flight is independently a **one-way leg**. Compare all four fare categories **for every leg**, choose the cheapest valid combination. Never use a fictitious round-trip ticket that skips the intermediate city. Origin HOME can be MCI or ICT, but **must match the final arrival airport** when asked. Test A=ATL or CLT, Dallas as DFW or DAL if actually supported by the fare source, Dallas-first or destination-first. Preserve six days in A, two in Dallas, total ≤10 days. Avoid assumptions about travelers' specific dates, nonstop priority or willingness to overnight-connect; show significant overnight/self-transfer risks.

**Normal return trip (e.g., HOME → ATL → HOME):** perform BOTH:
- a genuinely quoted single **round-trip ticket** search through Google (where supported), and
- two independent **one-way** searches; enumerate 3×3 = **9 Frontier product combinations**, plus Google/carrier mixes, and rank the final total. A round-trip fare must never be assumed equal to two one-way fares. Label source-confidence and checkout status.

**Result format:** lead with cheapest credible total; give a table of date, origin/destination, airline, flight numbers, departures/arrivals, stops/transfer risks, GoWild vs Discount Den vs Standard vs Google fares, chosen ticket source, and direct verifiable checkout links where available. Also show best alternative and total savings. If no live verification, SAY UNKNOWN; never invent quotes, links, flight numbers, or empty-seat claims.

## Running the existing combined code (developer / MUSE only)

Install pinned Python FLI **in the execution environment**, not on the user's phone:
```sh
bash tools/flight-unified/setup-local.sh
```
The runner uses `FLI_PYTHON` if set; point it to `tools/flight-unified/.venv/bin/python`.

Create an **ephemeral PRIVATE** JSON itinerary (do not commit the user's routes/dates or outputs):
```json
{
  "legs": [
    {"from":"DEN","to":"LAS","date":"2026-11-16"},
    {"from":"LAS","to":"DFW","date":"2026-11-19"},
    {"from":"DFW","to":"DEN","date":"2026-11-21"}
  ],
  "nonstop":false
}
```

Run:
```sh
FLI_PYTHON=tools/flight-unified/.venv/bin/python node tools/flight-unified/trip.mjs /private/path/itinerary.json > /private/path/flight-report.json
```
Then parse the single JSON output `FLIGHT1_UNIFIED_TRIP_V1`; `comparison.bestIndependentMix` and `comparison.strategies` provide the fare verdict. For a TWO-leg reciprocal return itinerary, `trip.mjs` also asks Google for a separate round-trip product. Results remain **indicative and not booked**. Existing provider calls must be paced, cease Frontier scanning on suspicious blocking, and label unresponsive sources UNKNOWN. Never commit personally identifying bookings or responses into public GitHub logs.

## What an AI assistant should do next — without rebuilding

1. Fetch source from this branch; run `node --test tools/flight-unified/trip-core.test.mjs`, then the existing offline suite. No new owner, backend, database or dashboard.
2. Run a **single small generic route** end-to-end with the original Frontier+FLI pairing; prove discountDenFare, standardFare and goWildFare handling. Avoid unnecessary Frontier requests.
3. Independently validate whether the Python FLI two-leg `second-leg.price` is a **total round-trip price** versus a leg price or reference display. Until validated, do not claim the `singleTicketCash` result is checkout-verified.
4. Make the combined `trip.mjs` callable by the **already-authorized execution owner available to MUSE/another AI**. This chat's connected GitHub tool can read/write code but does NOT expose arbitrary command or workflow dispatch; do not claim it can run a private route through GitHub. When an authorized executor is actually available, connect it as an adapter and do one true on-demand integration test. Preserve private authentication; never expose a public unauthenticated flight search.
5. Use the one combined report in ChatGPT/other AI conversations. The end user should only see the flight numbers and prices—not a request to install Tailscale/Node/Python.
6. Keep experimental FLI-JS and Eric Hansen adapters optional/separate until proven live. **The known-good working system is GoWild checker + original Python FLI.**

## Evidence and limitations

- GitHub CI from prior baseline: https://github.com/jshonuff/api-anything/actions/runs/41123654961 (30 tests, prior to this new trip strategy).
- Live pairing: https://github.com/jshonuff/api-anything/actions/runs/41085302160
- Prior failure: TypeScript FLI-JS 0 flight rows, Eric Python HTML config response; do not promote them as working.
- Supabase dispatch and canonical state remain controlled independently; any production deployment needs a separate approval and verification.
- **This repository stores working code. It does not, by itself, make ordinary ChatGPT able to run GitHub Actions or private scripts.** Never say a custom live GoWild check occurred when it was not actually executed.

**Definition of done:** One user request → authorized executor calls Frontier/GoWild+Discount Den+Standard and Google Flights → compare complete multi-city or true round-trip strategy → one credible priced answer, without asking Human JC to operate software.
