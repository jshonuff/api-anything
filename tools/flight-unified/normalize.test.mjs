import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFrontier,normalizeFli,normalizeEric,compareFrontierRoundTrip,summarizeSources,PROFILE,FARES} from './normalize.mjs';
const report={checkedAt:'2026-10-27T09:11:39Z',results:[
 {from:'DFW',to:'DEN',date:'2026-11-05',status:'OK',flights:[
  {flights:'F92549',depart:'2026-11-05T07:00:00',arrive:'2026-11-05T08:22:00',stops:0,gowild:78.99,discountDenFare:92,standardFare:151.98},
  {flights:'F91323',depart:'2026-11-05T10:45:00',arrive:'2026-11-05T12:08:00',stops:0,gowild:'NO_SEAT',discountDenFare:80,standardFare:120}
 ]},
 {from:'DEN',to:'DFW',date:'2026-11-09',status:'OK',flights:[
  {flights:'F94463',depart:'2026-11-09T20:27:00',arrive:'2026-11-09T23:42:00',stops:0,gowild:15.41,discountDenFare:65,standardFare:180},
  {flights:'F94069',depart:'2026-11-09T12:00:00',arrive:'2026-11-09T15:00:00',stops:0,gowild:'NO_SEAT',standardFare:90}
 ]}
]};
test('direct Frontier booking page is the sole observed GoWild seat signal',()=>{
 const [out]=normalizeFrontier(report);
 assert.equal(out.itineraries[0].goWildStatus,'FARE_OBSERVED');
 assert.equal(out.itineraries[1].goWildStatus,'NO_SEAT');
 assert.equal(out.itineraries[1].fares.gowild,null);
});
test('nine eligible round-trip combinations including standard-out and GoWild-return',()=>{
 const [a,b]=normalizeFrontier(report);
 const result=compareFrontierRoundTrip(a,b);
 assert.equal(result.status,'QUOTED');
 assert.equal(result.options.length,9);
 assert.deepEqual(new Set(result.options.map(x=>x.outboundFare)),new Set(FARES));
 assert.ok(result.options.some(x=>x.outboundFare==='standard'&&x.returnFare==='gowild'&&x.total===135.41));
 assert.equal(result.best.total,95.41);
 assert.equal(result.best.outboundFare,'discount_den');
 assert.equal(result.best.returnFare,'gowild');
});
test('an UNKNOWN blocked leg never becomes sold out',()=>{
 const [a,b]=normalizeFrontier(report);
 const broken={...b,status:'UNKNOWN',reason:'HTTP 429',itineraries:[]};
 const result=compareFrontierRoundTrip(a,broken);
 assert.equal(result.status,'UNKNOWN');
 assert.equal(result.best,null);
});
test('no free overhead bag implied; personal-item-only calculation is unchanged',()=>{
 const [a,b]=normalizeFrontier(report);
 assert.equal(PROFILE.carryOnBags,0);
 assert.equal(PROFILE.personalItems,1);
 assert.equal(compareFrontierRoundTrip(a,b,{...PROFILE,carryOnBags:1}).status,'EXTRAS_UNKNOWN');
});
test('Eric GoWild saver fares remain candidate observations only',()=>{
 const r=normalizeEric([{origin:'DFW',destination:'DEN',date:'2026-11-05',flight_number:'2549',saver_fare:10,standard_fare:100,stops:0}],{origin:'DFW',destination:'DEN',date:'2026-11-05'});
 assert.equal(r.status,'CANDIDATE_ONLY');
 assert.equal(r.itineraries[0].verification,'UNVERIFIED_GO_WILD_CANDIDATE');
});
test('Google Flights prices cannot be asserted as Frontier GoWild availability',()=>{
 const r=normalizeFli([{price:40,currency:'USD',stops:0,legs:[{flight_number:'AA24',departure_datetime:'2026-11-05T07:00:00'}]}],{origin:'DFW',destination:'DEN',date:'2026-11-05'});
 assert.equal(r.itineraries[0].fares.gowild,undefined);
 assert.equal(r.itineraries[0].fares.google_cash,40);
});
test('provider failure cannot erase the working Frontier fare',()=>{
 const [out,back]=normalizeFrontier(report);
 const partial=summarizeSources([out,back,{provider:'google_flights',status:'UNKNOWN',itineraries:[]},{provider:'eric_frontier',status:'UNKNOWN',itineraries:[]}],{outboundDate:'2026-11-05',returnDate:'2026-11-09'});
 assert.equal(partial.roundTrip.status,'QUOTED');
 assert.equal(partial.roundTrip.best.total,95.41);
 assert.equal(partial.statusByProvider.find(x=>x.provider==='google_flights').status,'PARTIAL_OR_UNKNOWN');
});
test('no stale or unreadable Frontier page gets an invented seat',()=>{
 const r=normalizeFrontier({checkedAt:'2026-10-27T09:00:00Z',results:[{from:'DFW',to:'DEN',date:'2026-11-05',status:'UNKNOWN',blocked:true,reason:'HTTP 429',flights:[]}]});
 assert.equal(r[0].itineraries.length,0);
 assert.equal(r[0].status,'UNKNOWN');
});
