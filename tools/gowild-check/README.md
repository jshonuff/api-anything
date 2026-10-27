# gowild-check

Read-only, low-volume Frontier GoWild! Pass availability checker with round-trip pricing.
Personal tool; not part of API Anything. Kept here so it outlives the session that built it.

## Run

Needs Node 18+ and no packages.

```
node gowild-check.js DFW LAS 2026-10-29 --return 2026-11-02 --nonstop   # round trip (default use)
node gowild-check.js DFW DEN,LAS,MCO 2026-10-29 --nonstop               # one-way scan
```

Behind an HTTPS proxy (some cloud sandboxes), prefix with `NODE_USE_ENV_PROXY=1`.

Round-trip mode prices the trip three ways (GoWild both ways, GoWild out with standard fare back, standard fare both ways) and names the cheapest total.

## Rules built in

- At least 20 s between searches and at most 12 per run (Frontier blocks bursts of about 14).
- Blocked or unreadable pages are reported as UNKNOWN, never "sold out". The run stops when Frontier blocks it.
- `goWildFare == -1` means no GoWild seat. `goWildFareSeatsRemaining` appears only when stock is low.
- Before the day-before window, Frontier may show a higher early-booking GoWild price ($78.99 vs $15.41 observed on 2026-10-27).

## Give it to another AI

Paste `PROMPT.md` along with `gowild-check.js`.

## Verified

2026-10-27, live: DFW→DEN (Oct 28/29), DFW→LAS/MCO/ATL/PHL (Oct 28), and the DFW⇄LAS round trip (Oct 29 / Nov 2).
This reads Frontier's public website, not an official API, so it may break or be blocked at any time.
