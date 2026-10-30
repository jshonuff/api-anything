# JC-SAVAGE FLIGHT-1 Unified Flight Search (Development Pilot)

**Status:** Development-only. Not deployed, not connected to Supabase, not a booking system.

## Design
One request, independently handled by three providers:
1. **Proven Frontier booking-page GoWild checker**: the unchanged `../gowild-check/gowild-check.js` remains the *only* adapter permitted to label GoWild as observed. Uses its existing session-cookie redirect and safe parsing. Reads reports from an ephemeral temp directory; no production mutation.
2. **Google Flights via FLI-JS**: optional `--fli` broad-market cash-fare comparison. Google Flights does not confirm Frontier GoWild seats.
3. **Eric Hansen's `flights` Python SDK**: optional `--eric` independent Frontier route/fare cross-check. Its `saver_fare` is a **candidate**, not a bookable GoWild guarantee.

The prior `frontierGoWildFlightFinder` repo may contribute the UI / route discovery later, but **do not operate its duplicate high-volume scraper**. It is not a dependency of this pilot.

## Run locally (no booking, no login)
Requires Node.js 22+:

```sh
node tools/flight-unified/run.mjs DFW DEN 2026-11-05 --return 2026-11-09 --nonstop
node --test tools/flight-unified/normalize.test.mjs
```

Optional FLI-JS: install the reviewed `fli-js` package within `tools/flight-unified` (pin to the reviewed version), then add `--fli`. Optional Eric Python: install MIT-licensed `ericchansen/flights` in a Python 3.12+ virtualenv, set `FLIGHT_PYTHON` to its interpreter and add `--eric`. Each optional adapter is **independent**: its failure is UNKNOWN and cannot remove valid Frontier observations.

*Note:* Google/Frontier third-party endpoints are undocumented and may break. Neither FLI nor the Python provider has been independently live-tested by this pilot. Do not activate scheduled crawling.

## Pricing policy
- **1 adult**, **one under-seat personal item**, **no overhead carry-on**, **no checked bag**.
- Frontier Elite Silver: standard seat when eligible/available without a standard-seat surcharge.
- Compare **all nine** eligible outbound/return fare-type combinations: GoWild, Discount Den, Standard in each direction.
- If a specific fare is missing, keep that option unavailable to *calculate*, not "sold out".
- All amounts come from the source response; **never double-add taxes or government fees**.
- Membership purchases are sunk costs; do not add them to marginal airfare.
- Final checkout can still differ. Label results as point-in-time fare observations, not guaranteed bookings.
- Existing GoWild booking windows, blackout dates, pass eligibility, Frontier site changes, and any itinerary-specific add-ons still apply.
- Compare Google Flights alternatives separately until fare inclusions and ancillary fees are verified. The pilot does not claim all-in cross-airline optimization yet.

## Privacy, rate limits, and failure behavior
- **Do not run private routes/dates as public GitHub Actions workflow inputs.** Workflow in this branch runs tests **only**, using fictional fixture fares, and performs no live searches.
- Do not print personal flight routes, dates, tokens or stored search results into public CI logs.
- Existing GoWild scanner caps at 12 route/date searches per invocation, defaults to 20 seconds between searches. Its documented discrepancy allowing `--delay 10` is a **separate outstanding fix**; this runner never passes the override.
- On HTTP 403/406/429, missing FlightData, timeout, parsing errors: report **UNKNOWN**, never "NO_SEAT" or sold-out.
- Searches are not retried automatically, and **no** overnight high-volume crawling is enabled.
- `run.mjs` captures original script stdout rather than publishing it, writes its temporary JSON under an OS temporary folder, and deletes it on exit. The JSON emitted locally may contain sensitive travel details; store in a private channel if needed.
- No credentials, no Frontier login, no reservations, no Supabase writes. Respect provider terms of service and use low-volume traffic.
- Any production integration requires FLIGHT-1 owner approval, explicit Supabase control-plane wiring, evidence, and security review.

## Validation gates
- [x] Reviewed source and license of Eric Hansen `flights` (MIT).
- [x] Baseline GoWild checker had an earlier independent live read from Frontier (2026-10-27).
- [x] Deterministic unit tests defined for 9 combinations, sentinel `-1`, unknown/blocked, baggage profile, provider isolation.
- [ ] GitHub CI green on pilot branch.
- [ ] FLI-JS live adapter verified (one route only).
- [ ] Eric Python adapter verified (one route only).
- [ ] Combined one-route comparison reconciled independently with actual checkout.
- [ ] Private execution and approved canonical persistence designed.
- [ ] Explicit production promotion approval.

## Authority
- Owner: existing **FLIGHT-1**.
- Canon: live **Supabase**. GitHub is source code and development evidence only.
- Existing JC-SAVAGE production dispatch remains disabled; this pilot must not override it.
- Fallback: retain the proven GoWild checker as a separate working path if FLI/Python integration becomes unreliable.
