// FLIGHT-1 local dashboard comparison model. Pure functions; no network, storage or permissions.
// Strictly deduplicate identical flights; preserve every independently sourced fare quote.
const FARE_LABELS = Object.freeze({
  gowild:'GoWild', discount_den:'Discount Den', standard:'Frontier standard', google_cash:'Google cash'
});
const MONEY = /^[0-9]+(?:[.][0-9]{1,2})?$/;
function code(value) { return String(value??'').trim().toUpperCase(); }
export function canonicalFlightNumber(input) {
 const raw=code(input).replace(/[ -]/g,'');
 if(!raw) return null;
 const parts=raw.split('+');
 const transformed=parts.map(part=>{
   // Frontier's website calls flight 2549 "FR2549", IATA carrier is "F9".
   if(/^FR[0-9]{1,5}$/.test(part))return 'F9'+part.slice(2);
   return /^[A-Z0-9]{2}[0-9]{1,5}[A-Z]?$/.test(part)?part:null;
 });
 return transformed.every(Boolean)?transformed.join('+'):null;
}
function preciseDeparture(raw) {
 if(typeof raw!=='string')return null;
 const dt=raw.trim();
 if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(?::[0-9]{2}(?:[.][0-9]+)?)?(?:Z|[+-][0-9]{2}:[0-9]{2})?$/.test(dt))return null;
 const local=dt.slice(0,16);
 const tz=dt.match(/(Z|[+-][0-9]{2}:[0-9]{2})$/)?.[1]??'NAIVE';
 return local+'@'+tz;
}
function itineraryKey(f) {
 const flight=canonicalFlightNumber(f?.flight),departure=preciseDeparture(f?.departure);
 const origin=code(f?.origin),dest=code(f?.destination);
 const day=String(f?.date??'');
 if(!flight||!departure||!(/^[A-Z]{3}$/.test(origin))||!(/^[A-Z]{3}$/.test(dest))||
    !(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(day)))return null;
 return [origin,dest,day,flight,departure].join('|');
}
function isPrice(n) {return typeof n==='number'&&Number.isFinite(n)&&n>=0;}
function quoteStatus(provider, fareType, itinerary) {
 if(provider==='frontier_booking') {
   if(fareType==='gowild')return itinerary.goWildStatus==='FARE_OBSERVED'?'FRONTIER_FARE_OBSERVED':'NOT_VERIFIED';
   return 'FRONTIER_FARE_OBSERVED';
 }
 return provider==='eric_frontier'?'CANDIDATE_ONLY':'REFERENCE_QUOTE';
}
function eligibleQuotes(f) {
 if(!f||f.currency!=='USD'||!f.fares||typeof f.fares!=='object')return [];
 const result=[];
 for(const [type,amount] of Object.entries(f.fares)) {
   if(!(type in FARE_LABELS)||!isPrice(amount))continue;
   const verification=quoteStatus(f.provider,type,f);
   if(verification==='NOT_VERIFIED')continue;
   result.push({type,label:FARE_LABELS[type],amount,provider:f.provider,verification,
     observedAt:typeof f.checkedAt==='string'?f.checkedAt:null,
     checkoutStatus:'NOT_VERIFIED',directBookingConfirmed:false});
 }
 return result;
}
export function buildDashboardModel(payload) {
 if(!payload||!Array.isArray(payload.candidates))throw new Error('Expected runner JSON with candidates array');
 const groups=new Map();
 let duplicates=0;
 for(const [index,flight] of payload.candidates.entries()) {
   if(!flight||typeof flight!=='object')continue;
   const key=itineraryKey(flight);
   const id=key??'UNMATCHED#'+index; // Never merge on route or price alone.
   const row=groups.get(id)??{id,exactMatch:Boolean(key),origin:code(flight.origin),destination:code(flight.destination),
     date:flight.date??'',flight:canonicalFlightNumber(flight.flight)??flight.flight??'Unknown',
     departure:flight.departure??'',arrival:flight.arrival??'',stops:flight.stops??null,
     quotes:[],providers:[],goWildStatus:'UNKNOWN'};
   if(groups.has(id))duplicates++;
   if(!row.providers.includes(flight.provider))row.providers.push(flight.provider);
   if(flight.provider==='frontier_booking')row.goWildStatus=flight.goWildStatus??'UNKNOWN';
   for(const quote of eligibleQuotes(flight)) {
     const exists=row.quotes.some(q=>q.type===quote.type&&q.provider===quote.provider&&
       q.amount===quote.amount&&q.observedAt===quote.observedAt);
     if(!exists)row.quotes.push(quote);
   }
   groups.set(id,row);
 }
 const flights=[...groups.values()].map(g=>{
   const ranked=[...g.quotes].sort((a,b)=>a.amount-b.amount);
   return {...g,quotes:ranked,
     bestPrice:ranked.length?ranked[0].amount:null,
     hasObservedGoWild:ranked.some(q=>q.type==='gowild'&&q.verification==='FRONTIER_FARE_OBSERVED')};
 }).sort((a,b)=>(a.bestPrice??Infinity)-(b.bestPrice??Infinity)||a.date.localeCompare(b.date));
 const providerStatus=Array.isArray(payload.statusByProvider)?payload.statusByProvider:[];
 return {schema:'flight-dashboard-v1',isDemonstration:payload.isDemonstration===true,
   generatedAt:payload.checkedAt??null,route:{origin:payload.origin??null,destination:payload.destination??null,
     date:payload.date??null,returnDate:payload.returnDate??null},
   flights,duplicatesCollapsed:duplicates,originalCount:payload.candidates.length,
   providerStatus,roundTrip:payload.roundTrip??null,problems:payload.problems??[],
   profile:payload.profile??{adults:1,personalItems:1,carryOnBags:0,checkedBags:0},
   checkoutVerification:'NOT_PERFORMED',
   notice:'Flight quotes are observations or references, not confirmed checkout totals or guaranteed bookability.'};
}
export function reconcileCheckout(quote, checkoutAmount, {confirmedByHuman=false}={}) {
 if(!quote||!isPrice(quote.amount)||quote.verification==='CANDIDATE_ONLY') {
   return {status:'NOT_ELIGIBLE_FOR_CHECKOUT_RECONCILIATION',delta:null};
 }
 const val=typeof checkoutAmount==='number'?checkoutAmount:
   typeof checkoutAmount==='string'&&MONEY.test(checkoutAmount.trim())?Number(checkoutAmount.trim()):NaN;
 if(!confirmedByHuman||!isPrice(val))return {status:'NOT_VERIFIED',delta:null};
 const delta=Math.round((val-quote.amount+Number.EPSILON)*100)/100;
 return {status:'MANUALLY_RECONCILED_NOT_BOOKING_GUARANTEE',
   quote:quote.amount,checkout:val,delta,
   pricesMatch:Math.abs(delta)<0.005,
   note:'Manual checkout amount only. Does not prove a reservation was purchased or that GoWild remains bookable.'};
}
