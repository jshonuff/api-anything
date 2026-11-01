// Local alert candidate selection only. No schedulers, messaging, or database writes.
// Concepts independently implemented from public GoWild alerting patterns.
export function selectAlertCandidates(routes,{maxFare=75,maxAgeMinutes=360,now=new Date().toISOString()}={}) {
 const t=Date.parse(now), cutoff=maxAgeMinutes*60*1000;
 if(!Number.isFinite(t)||!Number.isFinite(maxFare)||maxFare<0)throw new Error('invalid alert policy');
 const seen=new Set(),out=[];
 for(const route of routes) {
  if(route.provider!=='frontier_booking'||route.status!=='OBSERVED')continue;
  const observed=Date.parse(route.checkedAt??'');
  if(!Number.isFinite(observed)||observed>t||t-observed>cutoff)continue;
  for(const flight of route.itineraries??[]) {
   const price=flight.fares?.gowild;
   if(flight.goWildStatus!=='FARE_OBSERVED'||typeof price!=='number'||price>maxFare)continue;
   const key=[route.origin,route.destination,route.date,flight.flight,price.toFixed(2)].join('|');
   if(seen.has(key))continue;
   seen.add(key);
   out.push({key,origin:route.origin,destination:route.destination,date:route.date,
      flight:flight.flight,amount:price,currency:'USD',checkedAt:route.checkedAt,
      state:'ELIGIBLE_ALERT_CANDIDATE',delivery:'NOT_SENT',
      note:'Fare is observed, not guaranteed to be bookable'});
  }
 }
 return out.sort((a,b)=>a.amount-b.amount);
}


// Historical fare intelligence for existing FLIGHT-1 candidate alerts.
// Read-only: no polling, provider queries, booking, notifications, or database writes.
// Require an explicit canonical comparison key and confirmed all-in comparability;
// a route label or an old headline fare is not a comparable itinerary.
const validMoney=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<100000;
const cents=n=>Math.round((n+Number.EPSILON)*100)/100;
export function analyzeFareHistory(snapshots,{now=new Date().toISOString(),maxLatestAgeHours=24,
  minChangeUsd=20,minChangeFraction=0.05}={}){
 if(!Array.isArray(snapshots)||!Number.isFinite(Date.parse(now))||
 !Number.isFinite(maxLatestAgeHours)||maxLatestAgeHours<=0||
 !validMoney(minChangeUsd)||!Number.isFinite(minChangeFraction)||minChangeFraction<0||minChangeFraction>1)
  throw new Error('Invalid fare history input or policy');
 const clock=Date.parse(now), groups=new Map();
 for(const entry of snapshots){
  const m=entry?.metadata;
  if(!m||m.fare_comparable_total!==true||typeof m.fare_comparison_key!=='string'||
   m.fare_comparison_key.trim().length<16||m.fare_comparison_key.length>500||
   entry.currency!=='USD'||!validMoney(entry.price_amount))continue;
  if(!['VERIFIED','OBSERVED'].includes(entry.verification_state))continue;
  if(m.quote_state==='BLOCKED'||m.quote_state==='UNKNOWN'||m.quote_state==='SOLD_OUT_INFERRED')continue;
  const observedAt=Date.parse(entry.observed_at??'');
  if(!Number.isFinite(observedAt)||observedAt>clock||observedAt<clock-90*86400000)continue;
  // Ingestion-owned key: route, dates, fare product, passengers, bags/seats,
  // ticket structure, currency and tax/fee inclusion. Never infer from label.
  const key=m.fare_comparison_key.trim(), list=groups.get(key)??[];
  list.push({price:cents(entry.price_amount),observedAt,
   source:entry.source_provider??entry.provider_name??'UNSPECIFIED',
   evidence:entry.verification_state,checkoutVerified:m.checkout_total_verified===true});
  groups.set(key,list);
 }
 const result=[];
 for(const [key,entries] of groups){
  entries.sort((a,b)=>a.observedAt-b.observedAt);
  // Do not count two identical same-minute readings as independent samples.
  const unique=[],dedup=new Set();
  for(const x of entries){
   const sig=[x.source,Math.floor(x.observedAt/60000),x.price].join('|');
   if(!dedup.has(sig)){dedup.add(sig);unique.push(x);}
  }
  const current=unique.at(-1),previous=unique.length>1?unique.at(-2):null;
  const recent=clock-current.observedAt<=maxLatestAgeHours*3600000;
  const delta=previous?cents(current.price-previous.price):null;
  const threshold=previous?Math.max(minChangeUsd,cents(previous.price*minChangeFraction)):null;
  const material=previous&&Math.abs(delta)>=threshold;
  const direction=!recent?'STALE':!previous?'INSUFFICIENT_HISTORY':!material?'NO_MATERIAL_CHANGE':delta<0?'PRICE_DROP':'PRICE_INCREASE';
  const low=Math.min(...unique.map(x=>x.price)),high=Math.max(...unique.map(x=>x.price));
  result.push({comparisonKey:key,latestPrice:current.price,previousPrice:previous?.price??null,
   observedAt:new Date(current.observedAt).toISOString(),samples:unique.length,
   observedLow:low,observedHigh:high,delta,threshold,
   changePercent:previous&&previous.price>0?Math.round(delta/previous.price*1000)/10:null,
   direction,signal:direction==='PRICE_DROP'||direction==='PRICE_INCREASE',
   source:current.source,checkoutVerified:current.checkoutVerified,
   advisory:'EVIDENCE_ONLY',delivery:'NOT_SENT',
   note:'Comparable observed fares only. Not a price forecast or guaranteed checkout availability.'});
 }
 return result.sort((a,b)=>Number(b.signal)-Number(a.signal)||a.comparisonKey.localeCompare(b.comparisonKey));
}
