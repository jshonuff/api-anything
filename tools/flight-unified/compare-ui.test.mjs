import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDashboardModel,canonicalFlightNumber,reconcileCheckout} from './compare-ui.mjs';
const raw={
 origin:'DEN',destination:'LAS',date:'2026-11-01',checkedAt:'2026-10-30T18:00:00Z',
 profile:{adults:1,personalItems:1,carryOnBags:0,checkedBags:0},
 candidates:[
 {provider:'frontier_booking',checkedAt:'2026-10-30T18:00:00Z',flight:'FR2549',
  origin:'DEN',destination:'LAS',date:'2026-11-01',departure:'2026-11-01T09:30:00',
  arrival:'2026-11-01T10:45:00',stops:0,currency:'USD',goWildStatus:'FARE_OBSERVED',
  fares:{gowild:25,discount_den:72,standard:118}},
 {provider:'google_flights_python',checkedAt:'2026-10-30T18:03:00Z',flight:'F92549',
  origin:'DEN',destination:'LAS',date:'2026-11-01',departure:'2026-11-01T09:30:00',
  arrival:'2026-11-01T10:45:00',stops:0,currency:'USD',fares:{google_cash:85}},
 {provider:'google_flights_python',checkedAt:'2026-10-30T18:03:00Z',flight:'WN100',
  origin:'DEN',destination:'LAS',date:'2026-11-01',departure:'2026-11-01T10:30:00',
  arrival:'2026-11-01T11:45:00',stops:0,currency:'USD',fares:{google_cash:67}},
 ]
};
test('FR Frontier identity maps to F9 without dropping fare source information',()=>{
 assert.equal(canonicalFlightNumber('FR2549'),'F92549');
 assert.equal(canonicalFlightNumber(' F9 2549 '),'F92549');
 const x=buildDashboardModel(raw);
 assert.equal(x.originalCount,3);
 assert.equal(x.flights.length,2);
 assert.equal(x.duplicatesCollapsed,1);
 const shared=x.flights.find(v=>v.flight==='F92549');
 assert.equal(shared.quotes.length,4);
 assert.deepEqual(new Set(shared.providers),new Set(['frontier_booking','google_flights_python']));
 assert.equal(shared.hasObservedGoWild,true);
 assert.equal(shared.bestPrice,25);
});
test('different departure times must not join even with same flight number',()=>{
 const x=structuredClone(raw);
 x.candidates[1].departure='2026-11-01T09:50:00';
 assert.equal(buildDashboardModel(x).flights.length,3);
});
test('missing/ambiguous flight number is never merged by route/time or fare',()=>{
 const x=structuredClone(raw);
 x.candidates[1].flight='2549';
 assert.equal(buildDashboardModel(x).flights.length,3);
});
test('different or mixed timezone representations are not silently equated',()=>{
 const x=structuredClone(raw);
 x.candidates[1].departure='2026-11-01T09:30:00-07:00';
 assert.equal(buildDashboardModel(x).flights.length,3);
});
test('Google flight cannot acquire GoWild verification merely by matching itinerary',()=>{
 const x=buildDashboardModel(raw);
 const a=x.flights.find(f=>f.flight==='F92549');
 assert.equal(a.quotes.find(q=>q.type==='google_cash').verification,'REFERENCE_QUOTE');
 assert.equal(a.quotes.find(q=>q.type==='gowild').verification,'FRONTIER_FARE_OBSERVED');
});
test('unverified/candidate prices never become confirmed checkout amounts automatically',()=>{
 const x=buildDashboardModel(raw);
 const q=x.flights[0].quotes[0];
 assert.equal(q.checkoutStatus,'NOT_VERIFIED');
 assert.equal(reconcileCheckout(q,'27.50').status,'NOT_VERIFIED');
 const manual=reconcileCheckout(q,'27.50',{confirmedByHuman:true});
 assert.equal(manual.status,'MANUALLY_RECONCILED_NOT_BOOKING_GUARANTEE');
 assert.equal(manual.delta,2.5);
 assert.equal(manual.pricesMatch,false);
});
test('invalid amount, non-USD, and candidate-only fares cannot be verified',()=>{
 const x=buildDashboardModel(raw);
 const q=x.flights[0].quotes[0];
 assert.equal(reconcileCheckout(q,'-4',{confirmedByHuman:true}).status,'NOT_VERIFIED');
 assert.equal(reconcileCheckout(q,'5e3',{confirmedByHuman:true}).status,'NOT_VERIFIED');
 assert.equal(reconcileCheckout({...q,verification:'CANDIDATE_ONLY'},'1',{confirmedByHuman:true}).status,'NOT_ELIGIBLE_FOR_CHECKOUT_RECONCILIATION');
 const y=structuredClone(raw);
 y.candidates.push({...y.candidates[0],flight:'FR123',currency:'EUR',fares:{gowild:5}});
 const item=buildDashboardModel(y).flights.find(f=>f.flight==='F9123');
 assert.equal(item.quotes.length,0);
});
test('blocked Frontier and missing fares do not infer sold-out',()=>{
 const y={...raw,candidates:[{provider:'frontier_booking',flight:'FR88',origin:'DEN',destination:'LAS',
 date:'2026-11-01',departure:'2026-11-01T08:00:00',currency:'USD',goWildStatus:'UNKNOWN',
 fares:{gowild:null,standard:null}}],problems:[{provider:'frontier_booking',status:'UNKNOWN'}]};
 const r=buildDashboardModel(y);
 assert.equal(r.flights[0].goWildStatus,'UNKNOWN');
 assert.equal(r.flights[0].bestPrice,null);
 assert.equal(r.checkoutVerification,'NOT_PERFORMED');
});
