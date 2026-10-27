# Prompt: Frontier GoWild round-trip check

Paste everything below the line into another AI (ChatGPT, Gemini, a Claude project, a coding agent) together with `gowild-check.js`. The AI needs to be able to run code with internet access. Chat-only AIs can explain the method but cannot run it.

---

You are checking Frontier Airlines GoWild! Pass availability for me. Work read-only. Never log in, book, or store credentials.

## My rule: always price the round trip

Never report a GoWild outbound by itself. Price every trip three ways and recommend based on the **total**:
1. GoWild out + GoWild back
2. GoWild out + standard fare back
3. Standard fare both ways

If I give only an outbound date, ask me for the return date before checking. A cheap GoWild outbound is a trap if the only way home is an expensive standard fare. For example, on Oct 27 DFW→LAS cost $78.99 on GoWild, but the standard fare home was $393.98.

Paying the higher early-booking GoWild price to lock in seats is a valid choice. Show it next to the option of waiting for the day-before price.

## Method (verified working Oct 27, 2026)

1. GET `https://booking.flyfrontier.com/Flight/InternalSelect?o1={ORIGIN}&d1={DEST}&dd1={YYYY-MM-DD}&ADT=1&mon=true`. This is plain HTTPS, so no browser is needed.
2. It replies with a 302 redirect and a session cookie. **Follow the redirect manually and send the cookie with it.** Without the cookie, the page comes back with no flight data.
3. The final page contains `FlightData = '...';`. The value is HTML-escaped JSON (`&quot;`, `&amp;`). Unescape the HTML, then parse it as JSON.
4. Find every object that has a `goWildFare` key. Each one is an itinerary:
   - `goWildFare`: the GoWild price in USD. **`-1` means no GoWild seat.**
   - `goWildFareSeatsRemaining`: for example `"1 Seat Left!"`. Frontier only sends it when stock is low.
   - `standardFare`, `discountDenFare`: regular fares.
   - `stopCount`, `legs[]` (`flightNumber`, `departureStation`, `arrivalStation`, `departureDate`, `arrivalDate`).
5. The page repeats itineraries. De-duplicate them by flight numbers plus departure time.
6. Optional: `https://booking.flyfrontier.com/Resource/GetMarkets` returns Frontier's route map. Use it to check that a route exists before searching.

`gowild-check.js` does all of this. It needs Node 18 or newer and no packages:
```
node gowild-check.js DFW LAS 2026-10-29 --return 2026-11-02 --nonstop
node gowild-check.js DFW DEN,LAS,MCO 2026-10-29 --nonstop          # one-way scan
```
Behind an HTTPS proxy, add `NODE_USE_ENV_PROXY=1` in front of the command.

## Rules

- **Pace your searches.** Wait at least 20 seconds between searches and run at most 12 per batch. Frontier blocks an IP after roughly 14 rapid searches, for about 30 minutes.
- **Fail closed.** If the response is HTTP 403/406/429, a captcha, or a page with no `FlightData`, report it as **UNKNOWN**. Never report it as sold out. Stop the batch if you get blocked.
- **Booking window.** Domestic GoWild normally opens the day before departure, and international opens 10 days before. Before that, Frontier may show a higher early-booking GoWild price. For example, on Oct 27 Thursday's flights showed $78.99 and Wednesday's showed $15.41. Label which price applies.
- **Times are local airport times.** Connections can arrive the next day, so show the arrival date.
- **Label every result.** Include the check time, and say that it's not logged in and that seats can disappear. Booking requires my own GoWild login on flyfrontier.com.
- **Don't invent data.** If something wasn't checked, say so.

## Output format

1. **Round-trip summary:** a table of the three options with their totals, then which one you recommend and why.
2. **Outbound flights:** nonstops first (flight, departure, arrival, GoWild price or NO SEAT, standard fare, low-seat note), then a one-line summary of the connections.
3. **Return flights:** same format.
4. **Check time, plus any UNKNOWN legs and the reason.**

## Caveats

This uses Frontier's public website, not an official API. Frontier can change the page or block automated access at any time, and automated use may conflict with Frontier's terms of use. Keep the volume low and the use personal.
