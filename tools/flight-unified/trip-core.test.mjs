import test from 'node:test';
import assert from 'node:assert/strict';
import {compareItinerary,validateItinerary} from './trip-core.mjs';
const a='2026-11-16',b='2026-11-22',c='2026-11-24';
const leg=(from,to,date)=>({from,to,date});
const source=(from,to,date,gowild,den,standard,google)=>({
 status:'DEVELOPMENT_ONLY',statusByProvider:[
  {provider:'frontier_booking',status:'OBSERVED',count:1},
  {provider:'google_flights_python',status:'REFERENCE_ONLY',count:1}],
 candidates:[
 {provider:'frontier_booking',origin:from,destination:to,date,
  flight:'FR123',departure:date+'T08:00:00',currency:'USD',
  goWildStatus:gowild===null?'UNKNOWN':'FARE_OBSERVED',
  fares:{gowild,discount_den:den,standard}},
 {provider:'google_flights_python',origin:from,destination:to,date,
  flight:'DL456',departure:date+'T10:00:00',currency:'USD',fares:{google_cash:google}}
 ]});
test('city hopping is three separate one-way legs, can depart and return same airport',()=>{
 const spec={legs:[leg('MCI','ATL',a),leg('ATL','DFW',b),leg('DFW','MCI',c)]};
 const v=validateItinerary(spec);
 assert.equal(v.kind,'MULTI_CITY');assert.equal(v.returnsToOrigin,true);
 const out=compareItinerary(spec,[
 source('MCI','ATL',a,30,80,130,90),
 source('ATL','DFW',b,null,40,70,35),
 source('DFW','MCI',c,45,60,88,50)
 ]);
 assert.equal(out.mode,'MULTI_CITY');
 assert.equal(out.bestIndependentMix.total,110);
 assert.deepEqual(out.bestIndependentMix.legs.map(x=>x.fare),['gowild','google_cash','gowild']);
 assert.equal(out.strategies.singleTicketCash,null);
 assert.equal(out.legs[1].quotes.some(q=>q.fare==='gowild'),false);
});
test('round trip: nine Frontier combinations and two one-ways compared with a distinct ticket quote',()=>{
 const spec={legs:[leg('MCI','ATL',a),leg('ATL','MCI',c)]};
 const d=[source('MCI','ATL',a,30,40,65,100),source('ATL','MCI',c,55,60,90,80)];
 const out=compareItinerary(spec,d,{roundTripCashQuotes:[
  {provider:'google_flights_python',currency:'USD',total:72,priceSource:'SECOND_LEG_SHOPPING_SEARCH'}]});
 assert.equal(out.mode,'ROUND_TRIP');
 assert.equal(out.bestIndependentMix.total,70);
 assert.equal(out.bestIndependentMix.legs[0].fare,'gowild');
 assert.equal(out.bestIndependentMix.legs[1].fare,'discount_den');
 assert.equal(out.alternatives.length,16);
 assert.equal(out.alternatives.filter(x=>x.legs.every(l=>l.provider==='frontier_booking')).length,9);
 assert.equal(out.strategies.singleTicketCash.total,72);
 assert.equal(out.strategies.lowestIndicative.mode,'TWO_ONE_WAYS');
});
test('single round-trip cash ticket can beat two independent one-ways',()=>{
 const spec={legs:[leg('ICT','CLT',a),leg('CLT','ICT',c)]};
 const out=compareItinerary(spec,[
 source('ICT','CLT',a,null,105,120,115),
 source('CLT','ICT',c,null,100,130,125)
 ],{roundTripCashQuotes:[{provider:'google_flights_python',currency:'USD',total:175}]});
 assert.equal(out.bestIndependentMix.total,205);
 assert.equal(out.strategies.lowestIndicative.mode,'SINGLE_ROUND_TRIP_TICKET');
 assert.equal(out.strategies.lowestIndicative.total,175);
 assert.equal(out.strategies.lowestIndicative.checkoutStatus,'NOT_VERIFIED');
});
test('badly ordered itinerary or wrong return airport rejected',()=>{
 assert.throws(()=>validateItinerary({legs:[leg('MCI','ATL',a),leg('DFW','MCI',c)]}));
 assert.throws(()=>validateItinerary({legs:[leg('MCI','ATL',c),leg('ATL','MCI',a)]}));
 assert.throws(()=>validateItinerary({legs:[leg('MCI','MCI',a)]}));
 assert.equal(validateItinerary({legs:[leg('MCI','ATL',a),leg('ATL','ICT',c)]}).returnsToOrigin,false);
});
test('unknown/blocked sources are not sold-out, and Eric candidates cannot establish GoWild',()=>{
 const spec={legs:[leg('MCI','ATL',a)]};
 const out=compareItinerary(spec,[{statusByProvider:[{provider:'frontier_booking',status:'PARTIAL_OR_UNKNOWN'}],
 candidates:[{provider:'eric_frontier',origin:'MCI',destination:'ATL',date:a,currency:'USD',
   fares:{gowild:2}},{provider:'google_flights_python',origin:'MCI',destination:'ATL',date:a,
   currency:'USD',fares:{google_cash:117}}]}]);
 assert.equal(out.bestIndependentMix.total,117);
 assert.equal(out.legs[0].sourceStatus.frontier,'PARTIAL_OR_UNKNOWN');
 assert.equal(out.legs[0].missingMeansSoldOut,false);
 assert.equal(out.noGoWildMeansUnverified,true);
});
test('no available amounts means UNKNOWN; no fake zero fares',()=>{
 const out=compareItinerary({legs:[leg('MCI','ATL',a)]},[{candidates:[]}]);
 assert.equal(out.status,'UNKNOWN');
 assert.equal(out.bestIndependentMix,null);
});
