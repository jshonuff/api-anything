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

## Local comparison dashboard (development)

The standalone `dashboard/` interface reads the unified runner's JSON **inside the current browser tab**; it does not upload, publish, transmit or automatically persist it. It shows provider-specific quotes, precise matched-itinerary deduplication, fare filters and **manual** checkout reconciliation. In the menu, choose **Show synthetic demonstration** to explore without real travel data.

From the repository root:

```sh
node tools/flight-unified/run.mjs DEN LAS 2026-11-05 --nonstop --fli > ~/flight-search-private.json
python3 -m http.server 8765 --bind 127.0.0.1 --directory tools/flight-unified
```

Open `http://127.0.0.1:8765/dashboard/` and select the privately saved JSON file. The dashboard uses local ES modules, so opening the HTML directly with `file://` may fail browser security restrictions. Keep this server bound to loopback; do not host private results in the public repository. Delete the private JSON when no longer needed.

**Deduplication contract:** Only group the same route, travel date, carrier/flight number (including Frontier `FR` → `F9` alias), and compatible exact local departure timestamp with matching timezone representation. Ambiguous flight identities stay separate. Even when grouped, GoWild / Discount Den / standard / Google fares remain separately attributed; Google never proves a GoWild seat.

**Checkout reconciliation:** The viewer must enter the total actually displayed at airline checkout and explicitly attest to checking the identical itinerary and fare. The interface reports a price difference, *not* an airline verification API, ticket purchase, or guaranteed booking. No checkout details are sent to Supabase.

Verified offline CI: **18/18 tests passing** on https://github.com/jshonuff/api-anything/actions/runs/41112786143. Interactive browser test PASSED with synthetic data (2 cards, source filtering, manual checkout delta, no JavaScript errors): https://github.com/jshonuff/api-anything/actions/runs/41113159289. This does not verify real checkout prices.

## One-command private search dashboard (development)

The verified GoWild + original Python FLI pair is wired to the dashboard through a **localhost-only** server. The UI now provides airport, departure date, optional return date and nonstop selection. A new search runs only when the user presses Search; live sources may return UNKNOWN. No external cloud hosting, login, booking, alerts or Supabase write.

**One-time local dependency setup** from repository root (Python 3 required):

```sh
bash tools/flight-unified/setup-local.sh
```

**Launch the dashboard** whenever needed:

```sh
node tools/flight-unified/start-local.mjs
```

On the same machine, visit `http://127.0.0.1:8765/dashboard/`, choose airports and date, then press **Search Frontier + Google Flights**. No JSON import is necessary. The optional manual JSON import and synthetic demonstration still work.

The isolated Python virtualenv is gitignored. If already installed elsewhere, set `FLI_PYTHON` to its interpreter instead of running setup. No public GitHub Action is used for personal searches. The dashboard is accessible **only on the computer running the server**; this is not a hosted iPhone application.

**Security boundary:** Server binds only `127.0.0.1`, validates Host, Origin and per-process same-origin token, accepts one bounded POST search at a time, requires strict three-letter IATA airport codes and valid near-future dates, invokes the runner without shell expansion, serves only whitelisted static assets, sends no-store / content-security headers, and returns sanitized errors. It stores neither JSON fare files nor credentials; the original GoWild script uses a temporary directory that is removed after each search. Do not expose the port via tunnels, proxies or port forwarding.

**Validated** with simulated providers: HTTP input/authorization tests and headless Chromium interactive search, without live airline calls in CI. A locally run real search still requires installing the Python dependency and observing provider-specific behavior; no checkout or actual booking has been verified. Existing FLIGHT-1 production dispatch remains disabled.

## Private iPhone access via Tailscale Serve — opt-in pilot

**Status: code and simulated mobile test passed; NOT deployed on a real Tailscale network.**
This is a private Safari/mobile-browser path, not a native ChatGPT connector. Tailscale's Serve feature makes a loopback-only app accessible to an authorized user's devices on the same tailnet using an HTTPS `.ts.net` name. **Never substitute Tailscale Funnel**, which is public.

### Prerequisites

1. A computer running Node.js 22+, Python 3.12+, Git and Tailscale with access to your development checkout. This computer must be on and online during searches.
2. The one-time local FLI installation: `bash tools/flight-unified/setup-local.sh`.
3. Tailscale on the same computer and on your iPhone, both signed into your private tailnet. Tailscale HTTPS certificates and MagicDNS must be enabled.
4. The exact Tailscale HTTPS hostname for your computer and the exact login identity you intend to authorize. **Do not commit these to GitHub or publish them in CI logs.** Tailnet access policies should also restrict access.

### Opt-in usage (macOS/Linux shell)

In terminal 1 from the repository root, insert your actual private Tailscale values:

```sh
export FLIGHT_TAILNET_HOST="computer.your-tailnet.ts.net"
export FLIGHT_TAILNET_USER="your-tailscale-login@example.com"
node tools/flight-unified/start-tailnet.mjs
```

In terminal 2, run the **private** Tailscale reverse proxy in the foreground:

```sh
tailscale serve 8766
```

Tailscale prints an HTTPS tailnet URL. On your iPhone, connect through the Tailscale iOS app and visit that URL followed by `/dashboard/` in Safari. Submit a flight search and use the same price-verification labels as on desktop.

The backend binds to `127.0.0.1:8765`; the identity gateway binds to `127.0.0.1:8766`. The gateway uses explicit hostname allowlisting, the `Tailscale-User-Login` identity header supplied by Tailscale Serve, a single authorized user, HTTPS-origin validation, strict request and route allowlists, body-size limits, and sanitization of errors. It rewrites requests only to its fixed local backend. Tagged devices without user identity are intentionally denied. It creates no user account, database, bookings, or provider schedules. The existing GoWild and Python FLI retrieval modules are unchanged.

**Shutdown:** Press Ctrl+C in both terminals. If you chose to configure Serve persistently in a different way, first inspect `tailscale serve status`, then disable only the relevant HTTPS Serve mapping using `tailscale serve --https=443 off`. Never enable `tailscale funnel` for this pilot.

**Security limitations:** Anyone authorized as the specified Tailscale user on an allowed device can execute searches while the gateway is running; protect the tailnet account and devices. Access is private to the tailnet, not a general-purpose multi-user web service. Tailscale Serve forwards user identity on tailnet requests; a public Funnel connection does not supply it, and this gateway rejects missing identities. If your installed Tailscale version forwards different Host headers, the gateway deliberately fails closed pending an explicit compatibility test. Local applications on the same computer are within the machine's trust boundary.

**What was actually tested:** 30/30 offline tests including wrong-host, wrong-user, missing identity, forged Origin, oversized/chunked requests, safe local forwarding, and no changes to the production owner. A Chromium 390×844 mobile-view test passed through a **simulated** Serve relay with a mocked provider; it made no Frontier/Google live queries. Evidence:
- Offline: https://github.com/jshonuff/api-anything/actions/runs/41123359355
- Simulated mobile UI: https://github.com/jshonuff/api-anything/actions/runs/41123376431

**Remaining acceptance:** Authorize device setup yourself, perform a real iPhone → Tailscale Serve → local gateway check, confirm a low-volume live search and checkout, verify privacy/security against actual Tailscale proxy behavior, and receive explicit FLIGHT-1 promotion approval. No real mobile access has been activated by ChatGPT. This approach does not make the tailnet hostname accessible to ChatGPT's cloud; direct chat querying requires a separately approved connector architecture.

## Remaining promotion gates

- Review and independently reconcile selected fares with actual checkout and fare inclusions.
- Apply date-aware booking eligibility and ensure round-trip choices are genuinely bookable when recommended.
- Confirm reliable Google Flights Python response across more than one route/date without excessive queries.
- [x] Local no-upload comparison dashboard and synthetic Chromium smoke test passed; [ ] real checkout reconciliation and private deployment approval remain.
- Design private execution and the existing FLIGHT-1 authorized persistence/notification path.
- Recheck live Supabase authority and obtain explicit promotion approval before any production activation.

**Fallback contract:** If Python FLI, Eric or FLI-JS degrades, preserve the separately working GoWild checker and do not reclassify unknown prices as unavailable. Canonical owner: FLIGHT-1. Supabase remains canonical; GitHub is development source and evidence only.
