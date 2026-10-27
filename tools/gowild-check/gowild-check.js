#!/usr/bin/env node
// GoWild availability checker — read-only, not logged in, paced. No npm packages.
//
// Fetches Frontier's public flight-select page over plain HTTPS. The first
// response is a 302 that sets a session cookie; the cookie must ride along on
// the redirect or the page comes back without flight data. The page embeds an
// HTML-escaped JSON blob, `FlightData = '...'`, whose itineraries carry
// `goWildFare` (-1 = no GoWild seat) and `goWildFareSeatsRemaining`.
// A blocked or unreadable page is reported as UNKNOWN — never as "sold out".
//
// One-way:     node gowild-check.js DFW DEN,LAS,MCO 2026-10-29 [--nonstop] [--delay 20]
// Round trip:  node gowild-check.js DFW LAS 2026-10-29 --return 2026-11-02 [--nonstop]
//              Prices the trip three ways (GoWild both ways / GoWild out + standard
//              back / standard both ways) and recommends on the total.
// Output:      report on screen + results-<ORIGIN>-<DATE>.json
//
// Requires Node 18+. Behind an HTTPS proxy, run with NODE_USE_ENV_PROXY=1 (Node 22.21+).

const fs = require('fs');

const args = process.argv.slice(2);
const valueFlags = new Set(['--delay', '--return']);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !valueFlags.has(args[i - 1]));
const [origin, destList, date] = (positional[0] ? [positional[0].toUpperCase(), positional[1], positional[2]] : []);
const returnDate = opt('--return', null);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
if (!origin || !destList || !isDate(date) || (returnDate !== null && !isDate(returnDate))) {
  console.error('Usage: node gowild-check.js ORIGIN DEST1,DEST2 YYYY-MM-DD [--return YYYY-MM-DD] [--nonstop] [--delay SECONDS]');
  process.exit(2);
}
const dests = destList.toUpperCase().split(',').filter(Boolean);
const nonstopOnly = args.includes('--nonstop');
const delayMs = Math.max(10, Number(opt('--delay', 20))) * 1000; // never faster than 10s
const MAX_SEARCHES = 12; // Frontier starts blocking around ~14 rapid searches per IP
const searches = dests.length * (returnDate ? 2 : 1);
if (searches > MAX_SEARCHES) {
  console.error(`Refusing ${searches} searches in one run; max ${MAX_SEARCHES}. Split the list.`);
  process.exit(2);
}

const UA = 'gowild-check/1.0 (personal, low-volume)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Frontier HTML-escapes the blob (&quot; &amp; ...), so unescape before parsing.
function htmlUnescape(s) {
  return s
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

function* itineraries(node) {
  if (Array.isArray(node)) { for (const x of node) yield* itineraries(x); return; }
  if (node && typeof node === 'object') {
    if ('goWildFare' in node) yield node;
    for (const v of Object.values(node)) yield* itineraries(v);
  }
}

async function fetchSelectPage(from, to, day) {
  const jar = new Map();
  let url = `https://booking.flyfrontier.com/Flight/InternalSelect?o1=${from}&d1=${to}&dd1=${day}&ADT=1&mon=true`;
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html',
        Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
      },
    });
    for (const c of res.headers.getSetCookie()) {
      const kv = c.split(';')[0];
      const i = kv.indexOf('=');
      if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1));
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url).href;
      continue;
    }
    return { status: res.status, html: await res.text() };
  }
  return { status: 0, html: '' };
}

async function checkRoute(from, to, day) {
  const base = { from, to, date: day, flights: [] };
  let page;
  try {
    page = await fetchSelectPage(from, to, day);
  } catch (e) {
    return { ...base, status: 'UNKNOWN', reason: `network error: ${String(e.cause || e).slice(0, 120)}` };
  }
  if ([403, 406, 429].includes(page.status)) {
    return { ...base, status: 'UNKNOWN', blocked: true, reason: `blocked by Frontier (HTTP ${page.status}) — stop and wait ~30 min` };
  }
  const m = page.html.match(/FlightData\s*=\s*'(.*?)';/s);
  let data = null;
  try { data = m ? JSON.parse(htmlUnescape(m[1])) : null; } catch (_) { /* unreadable */ }
  if (!data) {
    return { ...base, status: 'UNKNOWN', reason: `no readable FlightData (HTTP ${page.status}; possible captcha or page change)` };
  }
  const seen = new Set();
  for (const f of itineraries(data)) {
    const legs = f.legs || [];
    if (!legs.length) continue;
    const key = legs.map((l) => `${l.flightNumber}@${l.departureDate}`).join('|');
    if (seen.has(key)) continue; // the page repeats itineraries
    seen.add(key);
    const stops = Number(f.stopCount ?? legs.length - 1);
    if (nonstopOnly && stops > 0) continue;
    const gw = typeof f.goWildFare === 'number' ? f.goWildFare : null;
    base.flights.push({
      flights: legs.map((l) => `FR${l.flightNumber}`).join('+'),
      route: [legs[0].departureStation, ...legs.map((l) => l.arrivalStation)].join('-'),
      depart: legs[0].departureDate,
      arrive: legs[legs.length - 1].arrivalDate,
      stops,
      gowild: gw === null ? 'UNKNOWN' : gw < 0 ? 'NO_SEAT' : gw,
      gowildSeatsNote: f.goWildFareSeatsRemaining || null,
      standardFare: typeof f.standardFare === 'number' && f.standardFare > 0 ? f.standardFare : null,
      discountDenFare: typeof f.discountDenFare === 'number' && f.discountDenFare > 0 ? f.discountDenFare : null,
    });
  }
  base.flights.sort((a, b) => a.stops - b.stops || a.depart.localeCompare(b.depart));
  return { ...base, status: 'OK' };
}

const money = (n) => (typeof n === 'number' ? `$${n.toFixed(2)}` : n);

function printRoute(r) {
  console.log(`\n== ${r.from} -> ${r.to}  ${r.date}  [${r.status}]${r.reason ? '  ' + r.reason : ''}`);
  for (const f of r.flights) {
    console.log(
      `  ${f.flights.padEnd(16)} ${f.route.padEnd(12)} ${f.depart.slice(11, 16)} -> ${f.arrive.slice(5, 16).replace('T', ' ')}` +
      `  stops=${f.stops}  GoWild=${String(money(f.gowild)).padEnd(8)} std=${money(f.standardFare)}` +
      `${f.gowildSeatsNote ? '  ' + f.gowildSeatsNote : ''}`
    );
  }
}

// Cheapest flight on one leg by a fare field; null when nothing is priced.
function cheapest(flights, field) {
  let best = null;
  for (const f of flights) {
    const p = f[field];
    if (typeof p === 'number' && (!best || p < best.price)) best = { price: p, flight: f };
  }
  return best;
}

function roundTrip(out, back) {
  const opts = [
    ['GoWild out + GoWild back', cheapest(out.flights, 'gowild'), cheapest(back.flights, 'gowild')],
    ['GoWild out + standard back', cheapest(out.flights, 'gowild'), cheapest(back.flights, 'standardFare')],
    ['Standard both ways', cheapest(out.flights, 'standardFare'), cheapest(back.flights, 'standardFare')],
  ].map(([label, o, b]) => ({
    label,
    total: o && b ? +(o.price + b.price).toFixed(2) : null,
    out: o && { flight: o.flight.flights, depart: o.flight.depart, price: o.price, note: o.flight.gowildSeatsNote },
    back: b && { flight: b.flight.flights, depart: b.flight.depart, price: b.price, note: b.flight.gowildSeatsNote },
  }));
  console.log(`\n== ROUND TRIP ${out.from} <-> ${out.to}  out ${out.date} / back ${back.date}`);
  if (out.status !== 'OK' || back.status !== 'OK') {
    console.log('  UNKNOWN — one leg could not be read; no recommendation.');
    return { options: opts, recommendation: null };
  }
  for (const o of opts) {
    const leg = (l) => (l ? `${l.flight} ${l.depart.slice(11, 16)} ${money(l.price)}${l.note ? ' (' + l.note + ')' : ''}` : 'not available');
    console.log(`  ${o.label.padEnd(28)} ${o.total === null ? 'not available' : money(o.total).padEnd(9)}  out: ${leg(o.out)} | back: ${leg(o.back)}`);
  }
  const priced = opts.filter((o) => o.total !== null).sort((a, b) => a.total - b.total);
  const rec = priced[0] || null;
  console.log(rec ? `  Cheapest total: ${rec.label} at ${money(rec.total)}` : '  No priced combination found.');
  return { options: opts, recommendation: rec && rec.label };
}

(async () => {
  const checkedAt = new Date().toISOString();
  const results = [];
  const trips = [];
  let n = 0;
  const run = async (from, to, day) => {
    if (n++ > 0) await sleep(delayMs);
    const r = await checkRoute(from, to, day);
    printRoute(r);
    return r;
  };
  for (const dest of dests) {
    const out = await run(origin, dest, date);
    results.push(out);
    if (out.blocked) { console.log('\nStopping early: Frontier is rate-limiting. Remaining routes not checked.'); break; }
    if (returnDate) {
      const back = await run(dest, origin, returnDate);
      results.push(back);
      trips.push({ dest, ...roundTrip(out, back) });
      if (back.blocked) { console.log('\nStopping early: Frontier is rate-limiting. Remaining routes not checked.'); break; }
    }
  }
  const file = `results-${origin}-${date}${returnDate ? '-rt-' + returnDate : ''}.json`;
  fs.writeFileSync(file, JSON.stringify({ origin, date, returnDate, checkedAt, source: 'booking.flyfrontier.com (not logged in)', results, trips }, null, 2));
  console.log(`\nSaved ${file}. Checked ${checkedAt}. Readings are point-in-time; seats can disappear before booking.`);
  if (!returnDate) console.log('One-way check only — price the return before booking a GoWild outbound.');
})();
