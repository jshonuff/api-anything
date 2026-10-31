// FLIGHT-1 fare strategy engine: independent of provider execution and production services.
// Input = results of existing run.mjs for each journey leg. No booking/persistence.
export const SOURCES = Object.freeze(['gowild','discount_den','standard','google_cash']);
const money=n=>Math.round((n+Number.EPSILON)*100)/100;
const num=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<100000;
const iata=x=>typeof x==='string'&&/^[A-Z]{3}$/.test(x);
const day=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)&&
  !Number.isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
export function validateItinerary(spec){
 if(!spec||typeof spec!=='object'||!Array.isArray(spec.legs)||spec.legs.length<1||spec.legs.length>5)
  throw Error('Specify 1 to 5 sequential flight legs.');
 let prior=null;
 for(const [i,l] of spec.legs.entries()){
  if(!l||!iata(l.from)||!iata(l.to)||l.from===l.to||!day(l.date))
   throw Error('Invalid airport or date on leg '+(i+1));
  if(prior&&(prior.to!==l.from||l.date<prior.date))throw Error('Legs must join in time and airport.');
  prior=l;
 }
 if(spec.nonstop!==undefined&&typeof spec.nonstop!=='boolean')throw Error('Invalid nonstop filter');
 const legs=spec.legs;
 const roundTrip=legs.length===2&&legs[0].from===legs[1].to&&legs[0].to===legs[1].from;
 return {legs:legs.map(l=>({from:l.from,to:l.to,date:l.date})),nonstop:spec.nonstop===true,
  kind:roundTrip?'ROUND_TRIP':legs.length===1?'ONE_WAY':'MULTI_CITY',
  returnsToOrigin:legs.at(-1).to===legs[0].from};
}
function quotesForLeg(leg,result){
 if(!result||!Array.isArray(result.candidates))return [];
 const quotes=[];
 for(const row of result.candidates){
  if(!row||row.origin!==leg.from||row.destination!==leg.to||row.date!==leg.date||row.currency!=='USD')
   continue;
  // Only Frontier's booking-page parser may declare GoWild and Discount Den observations.
  const fields=row.provider==='frontier_booking'?
    ['gowild','discount_den','standard']:row.provider==='google_flights_python'?
    ['google_cash']:[];
  for(const type of fields){
   const price=row.fares?.[type];
   if(!num(price))continue;
   if(type==='gowild'&&row.goWildStatus!=='FARE_OBSERVED')continue;
   quotes.push({fare:type,amount:price,flight:row.flight||'UNSPECIFIED',
    departure:row.departure||null,provider:row.provider,origin:leg.from,destination:leg.to,
    date:leg.date,confidence:type==='gowild'?'GOWILD_FARE_OBSERVED':
      type==='google_cash'?'GOOGLE_REFERENCE_QUOTE':'FRONTIER_FARE_OBSERVED',
    checkoutStatus:'NOT_VERIFIED'});
  }
 }
 // Keep the cheapest instance of each product; full source rows remain in result.
 return SOURCES.map(fare=>quotes.filter(q=>q.fare===fare).sort((a,b)=>a.amount-b.amount)[0]).filter(Boolean);
}
function sourceState(result,provider){
 const record=result?.statusByProvider?.find(x=>x.provider===provider);
 return record?.status??'NOT_CHECKED';
}
export function compareItinerary(spec,legResults,{roundTripCashQuotes=[]}={}){
 const v=validateItinerary(spec);
 if(!Array.isArray(legResults)||legResults.length!==v.legs.length)
  throw Error('Every itinerary leg needs its own provider result, including UNKNOWN.');
 const byLeg=v.legs.map((leg,i)=>{
  const result=legResults[i];
  const quotes=quotesForLeg(leg,result);
  return {leg,quotes,sourceStatus:{
   frontier:sourceState(result,'frontier_booking'),
   google:sourceState(result,'google_flights_python')},
   missingMeansSoldOut:false};
 });
 // Each leg can be independently selected as GoWild, Discount Den, standard, or Google cash.
 // For 2-leg return trips this includes all 9 Frontier-only pairings plus cross-carrier mixes.
 let combos=[{total:0,legs:[]}];
 for(const leg of byLeg){
  combos=combos.flatMap(previous=>leg.quotes.map(q=>({
   total:money(previous.total+q.amount),legs:[...previous.legs,q]
  })));
 }
 combos.sort((a,b)=>a.total-b.total);
 const best=combos[0]??null;
 const bundles=v.kind==='ROUND_TRIP'?roundTripCashQuotes.filter(q=>num(q.total)&&q.currency==='USD'&&q.provider==='google_flights_python').map(q=>({
  ...q,mode:'SINGLE_ROUND_TRIP_TICKET',checkoutStatus:'NOT_VERIFIED',
  confidence:'ROUND_TRIP_SEARCH_REFERENCE'
 })).sort((a,b)=>a.total-b.total):[];
 const bundle=bundles[0]??null;
 const strategy=v.kind==='ROUND_TRIP'?{
  separateOneWays:best,
  singleTicketCash:bundle,
  lowestIndicative:!best?bundle:!bundle?{...best,mode:'TWO_ONE_WAYS'}:
   best.total<=bundle.total?{...best,mode:'TWO_ONE_WAYS'}:bundle,
  caveat:'Search quotes are not final checkout prices. GoWild may not be bookable outside its booking window.'
 }:{separateOneWays:best,singleTicketCash:null,lowestIndicative:best,
  caveat:'City-hop legs are priced separately; do not compare with an unrelated round-trip ticket.'};
 return {mode:v.kind,returnsToOrigin:v.returnsToOrigin,profile:{
  adults:1,personalItems:1,overheadCarryOn:0,checkedBags:0,
  seat:'Elite Silver standard seat only when eligible'
 },legs:byLeg,bestIndependentMix:best,strategies:strategy,
   alternatives:combos.slice(0,25),roundTripQuotes:bundles,
   status:best||bundle?'INDICATIVE_PRICES':'UNKNOWN',
   booking:'NOT_BOOKED',noGoWildMeansUnverified:true,
   rule:'Never convert missing or blocked GoWild fares into sold-out. No duplicate tax/fee or bag charges.'};
}
