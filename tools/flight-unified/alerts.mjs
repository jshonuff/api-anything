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
