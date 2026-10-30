// Pure, deterministic FLIGHT-1 pilot normalizer. No network or persistence.
export const PROFILE = Object.freeze({
  adults: 1, personalItems: 1, carryOnBags: 0, checkedBags: 0,
  elite: 'SILVER', standardSeatFee: 0, currency: 'USD'
});
export const FARES = ['gowild', 'discount_den', 'standard'];
const cleanPrice = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
const cleanText = (v) => typeof v === 'string' ? v.trim() : '';
const dollars = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export function normalizeFrontier(report) {
  if (!report || !Array.isArray(report.results)) throw new Error('Frontier report missing results');
  const checkedAt = report.checkedAt ?? null;
  return report.results.map(route => ({
    provider: 'frontier_booking',
    origin: route.from, destination: route.to, date: route.date,
    checkedAt, status: route.status === 'OK' ? 'OBSERVED' : 'UNKNOWN',
    reason: route.reason ?? null, blocked: Boolean(route.blocked),
    itineraries: route.status === 'OK' ? (route.flights ?? []).map(f => ({
      provider: 'frontier_booking', flight: cleanText(f.flights),
      origin: route.from, destination: route.to, date: route.date,
      departure: cleanText(f.depart), arrival: cleanText(f.arrive),
      stops: Number.isInteger(f.stops) ? f.stops : null,
      currency: 'USD', verification: 'FARE_OBSERVED_NOT_BOOKING_GUARANTEE',
      lowSeatsNote: f.gowildSeatsNote ?? null,
      fares: {
        gowild: f.gowild === 'NO_SEAT' ? null : cleanPrice(f.gowild),
        discount_den: cleanPrice(f.discountDenFare),
        standard: cleanPrice(f.standardFare)
      },
      goWildStatus: f.gowild === 'NO_SEAT' ? 'NO_SEAT' : cleanPrice(f.gowild) === null ? 'UNKNOWN' : 'FARE_OBSERVED'
    })) : []
  }));
}
export function normalizeEric(rows, {origin, destination, date, checkedAt = null} = {}) {
  if (!Array.isArray(rows)) throw new Error('Eric results must be an array');
  return {provider:'eric_frontier', origin, destination, date, checkedAt,
    status:'CANDIDATE_ONLY', itineraries: rows.map(r => ({
      provider:'eric_frontier', flight:cleanText(r.flight_number),
      origin:r.origin ?? origin, destination:r.destination ?? destination,
      date:r.date ?? date, departure:r.depart_time ?? '',
      arrival:r.arrive_time ?? '', stops:Number.isInteger(r.stops) ? r.stops : null,
      currency:r.currency ?? 'USD', verification:'UNVERIFIED_GO_WILD_CANDIDATE',
      fares:{gowild:cleanPrice(r.saver_fare),discount_den:cleanPrice(r.discounted_fare),
        standard:cleanPrice(r.standard_fare)}, miles:r.miles ?? null
    }))};
}
export function normalizeFli(results, {origin, destination, date, checkedAt = null} = {}) {
  if (!Array.isArray(results)) throw new Error('FLI results must be an array');
  return {provider:'google_flights',origin,destination,date,checkedAt,
    status:'REFERENCE_ONLY',itineraries:results.filter(x => x && !Array.isArray(x)).map(r => ({
      provider:'google_flights',
      flight:(r.legs ?? []).map(l => String(l.flight_number ?? '')).join('+'),
      origin,destination,date,
      departure:r.legs?.[0]?.departure_datetime ?? '',
      arrival:r.legs?.at(-1)?.arrival_datetime ?? '',
      stops:Number.isInteger(r.stops) ? r.stops : null,
      currency:r.currency ?? 'USD', verification:'GOOGLE_SEARCH_QUOTE_NOT_FRONTIER_GOWILD',
      fares:{google_cash:cleanPrice(r.price)}, bookingUrl:r.bookingUrl ?? null
    }))};
}
function cheapestFlight(route, fareType) {
  if (!route || route.status !== 'OBSERVED') return null;
  const choices = (route.itineraries ?? []).filter(f=>typeof f.fares?.[fareType] === 'number' && f.currency==='USD');
  choices.sort((a,b)=>a.fares[fareType]-b.fares[fareType]);
  const flight=choices[0];
  return flight ? {fareType,amount:flight.fares[fareType],flight:flight.flight,departure:flight.departure} : null;
}
export function compareFrontierRoundTrip(out, back, profile=PROFILE) {
  if (!out || !back || out.status !== 'OBSERVED' || back.status !== 'OBSERVED')
    return {status:'UNKNOWN',options:[],best:null,reason:'One or both Frontier legs were not readable; cannot declare a fare unavailable.'};
  if (out.origin !== back.destination || out.destination !== back.origin)
    throw new Error('Round-trip routes are not reciprocal');
  if (profile.carryOnBags !== 0 || profile.checkedBags !== 0 || profile.personalItems !== 1)
    return {status:'EXTRAS_UNKNOWN',options:[],best:null,reason:'Selected baggage profile requires repricing.'};
  const options=[];
  for (const outboundFare of FARES) for(const returnFare of FARES) {
    const outbound=cheapestFlight(out,outboundFare);
    const inbound=cheapestFlight(back,returnFare);
    options.push({outboundFare,returnFare, outbound,inbound,
      total:outbound && inbound ? dollars(outbound.amount+inbound.amount) : null,
      currency:'USD',pricing:'OBSERVED_FARES_NO_EXTRA_BAGS_STANDARD_SEAT_INCLUDED',
      bookingStatus:'RECONFIRM_WITH_FRONTIER_AT_CHECKOUT'});
  }
  const ranked=options.filter(o=>o.total !== null).sort((a,b)=>a.total-b.total);
  return {status:ranked.length?'QUOTED':'NO_PRICED_COMBINATION',options,best:ranked[0]??null,
    note:'Pricing does not guarantee booking. Taxes/fees must not be added twice.'};
}
export function summarizeSources(routes, {outboundDate,returnDate=null}={}) {
  const providers=[...new Set(routes.map(x=>x.provider))];
  const statusByProvider=providers.map(provider=>{
    const results=routes.filter(r=>r.provider===provider);
    return {provider,status:results.some(r=>r.status==='UNKNOWN')?'PARTIAL_OR_UNKNOWN':results[0]?.status??'UNKNOWN',
      count:results.reduce((n,r)=>n+(r.itineraries?.length??0),0)};
  });
  const frontier=routes.filter(x=>x.provider==='frontier_booking');
  const outbound=frontier.find(x=>x.date===outboundDate);
  const inbound=returnDate?frontier.find(x=>x.date===returnDate):null;
  const roundTrip=returnDate ? compareFrontierRoundTrip(outbound,inbound) : null;
  const candidates=routes.flatMap(r=>r.itineraries ?? []);
  return {status:'DEVELOPMENT_ONLY',profile:PROFILE,checkedAt:new Date().toISOString(),
    statusByProvider,roundTrip,candidates,provenance:'provider-specific observations; cross-provider results are not interchangeable',
    note:'Only Frontier booking-page GoWild values are treated as observed; Python saver fares are candidates.'};
}
