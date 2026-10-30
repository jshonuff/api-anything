# JC-SAVAGE FLIGHT-1 Unified Flight Search — Development Pilot

**Status: working two-provider live pilot, NOT production.** Current owners and dispatch gates remain in live Supabase. No Supabase changes, logins, bookings, deployed dashboards, alert delivery, or scheduled live crawling.

## Verified architecture

| Adapter | Mode | Verification |
|---|---|---|
| Existing `../gowild-check/gowild-check.js` | Mandatory Frontier fare/seat observation | Live success, unchanged |
| Original FLI Python (`--fli`) | Google Flights cash-fare comparison | Live success Oct 30 |
| TypeScript FLI-JS (`--fli-js`) | Optional experimental Google comparison | Source builds, but live parser returned no usable rows |
| Eric Hansen Python SDK (`--eric`) | Optional Frontier cross-check only | HTTP 200 returned HTML where SDK expected JSON config |
| Original Frontier Finder dashboard | Possible later UI source | Not integrated; original bulk scraper must not run in parallel |

**Only the existing Frontier booking-page checker can classify a GoWild fare as observed.** Google Flights rows are general airfare references, not GoWild seat confirmation. Eric's `saver_fare` is a candidate only. Provider failure is UNKNOWN, not sold out.

## Quick start — verified pairing

Requirements: Node.js 22+, Python 3.12+ and FLI from reviewed source commit.

```sh
python -m pip install "git+https://github.com/jshonuff/fli.git@62eaaed9925c6ea63a606ccdbb74be3040e45d66"
node tools/flight-unified/run.mjs DEN LAS 2026-11-01 --nonstop --fli
```

If Python is elsewhere, set `FLI_PYTHON` to that interpreter. For return comparison, append `--return YYYY-MM-DD`. The CLI emits JSON locally; treat it as private. No transactions occur.

`--fli-js` is a separate development-only opt-in. FLI-JS is not available on npm at the reviewed version; run `bash tools/flight-unified/bootstrap-fli.sh` to build from pinned GitHub source before using it. `--eric` needs an independently installed MIT-licensed `ericchansen/flights` virtual environment and `FLIGHT_PYTHON`. **Neither experimental adapter is required for the working two-provider search.**

## Pricing and identity

- 1 adult; one **under-seat personal item only**, $0 for that item; zero overhead carry-ons and checked bags.
- Elite Silver: included standard seat when eligible and available; premium seat charges are not assumed waived.
- Frontier one-way fare types: GoWild, Discount Den, standard; compare all 3×3 = **9** eligible outbound/return combinations.
- Source taxes and fees must be counted only once. Existing membership acquisition costs are excluded from marginal travel cost.
- Frontier results are timestamped estimates subject to GoWild booking windows, blackout dates, seat supply, source changes and checkout verification.
- Google fares may differ in inclusions and do **not** establish GoWild availability or a complete all-in itinerary price.
- Underlying account eligibility / Silver benefit terms require final validation at booking. Do not expose account numbers or pass credentials in logs.

## Alerts, failures and privacy

`alerts.mjs` creates freshness-qualified **candidate** alerts locally; it does not send Telegram/WhatsApp notices, schedule checks, write Supabase, or guarantee bookings. Concepts were independently implemented from general GoWild Matcher patterns, not copied source.

No personal dates, routes, fares, tokens or full responses should be logged to a public GitHub runner. One-off generic live probes in this branch print only status and result counts; detailed JSON is discarded from ephemeral runner temp. Do not use public Actions for private itinerary monitoring.

The original GoWild script is unchanged; it caps searches at 12 route/date requests per run and defaults to 20 seconds between requests. Its standalone `--delay` override can still reduce pacing to 10 seconds; correcting that is an outstanding isolated maintenance item. The combined runner does not pass the override. HTTP 403/406/429, HTML where JSON was expected, parse errors, timeouts and missing data must remain UNKNOWN. Do not retry with bursts.

## Evidence (October 30, 2026)

- Baseline GoWild independently verified previously: https://github.com/jshonuff/api-anything/actions/runs/40478908146
- Original three-provider attempt: Frontier 4 observations; FLI-JS 0, Eric 0: https://github.com/jshonuff/api-anything/actions/runs/41078251090
- Isolated diagnostics: FLI-JS HTTP 200 with no readable Google WRB payload; Eric Frontier config HTTP 200 `text/html`, not JSON: https://github.com/jshonuff/api-anything/actions/runs/41084331331
- Original FLI Python independently returned **23** results: https://github.com/jshonuff/api-anything/actions/runs/41084588061
- **Combined one-route pilot: Frontier 5 observed flight records + Python FLI 23 Google results, zero provider errors**: https://github.com/jshonuff/api-anything/actions/runs/41085302160
- Core normalization and fail-safe tests cover 9-way fare comparisons, no-seat sentinel, unknowns, fallback and personal-item-only profile. Offline CI must remain green before further changes.

## Remaining promotion gates

- Review and independently reconcile selected fares with actual checkout and fare inclusions.
- Apply date-aware booking eligibility and ensure round-trip choices are genuinely bookable when recommended.
- Confirm reliable Google Flights Python response across more than one route/date without excessive queries.
- Build the combined dashboard (reuse original Frontier Finder's UI only; not its duplicate scraper).
- Design private execution and the existing FLIGHT-1 authorized persistence/notification path.
- Recheck live Supabase authority and obtain explicit promotion approval before any production activation.

**Fallback contract:** If Python FLI, Eric or FLI-JS degrades, preserve the separately working GoWild checker and do not reclassify unknown prices as unavailable. Canonical owner: FLIGHT-1. Supabase remains canonical; GitHub is development source and evidence only.
