import test from 'node:test';
import assert from 'node:assert/strict';
import {stageComparableFareObservation} from './fare-admit.mjs';
const now='2026-11-02T18:00:00Z';
const base=()=>({providerName:'Frontier',totalUsd:94.15,currency:'USD',
 evidence:{kind:'AIRLINE_DIRECT_QUOTE',sourceAuthenticated:true,sourceRef:'frontier-source-observation-A',
 sourceUrl:'https://www.flyfrontier.com/book/',observedAt:'2026-11-02T17:59:00Z',
 exactFareConfirmed:true,allTaxesFeesIncluded:true,baggageAndSeatIncluded:true},
 ticket:{tripType:'ONE_WAY',topology:'SINGLE_TICKET',adults:1,cabin:'ECONOMY',
 bags:{personal:1,carryOn:0,checked:0},seatTerms:'Standard included',
 segments:[{origin:'MCI',destination:'LAS',flightNumber:'F9123',
 departureAt:'2026-11-18T12:00:00-06:00',arrivalAt:'2026-11-18T13:20:00-08:00',fareProduct:'STANDARD'}]}});
test('valid exact fare is staged but NEVER automatically treated as comparable history',()=>{
 const x=stageComparableFareObservation(base(),{now});
 assert.equal(x.state,'OWNER_REVIEW_REQUIRED');
 assert.equal(x.snapshot.metadata.fare_comparable_total,false);
 assert.equal(x.snapshot.verification_state,'PARTIAL');
 assert.equal(x.snapshot.metadata.bookability,'NOT_LIVE_VERIFIED');
 assert.ok(x.comparisonKey.startsWith('FLIGHT1:SHA256:'));
});
test('same exact fare identity gets same key independent of observation price and time',()=>{
 const a=stageComparableFareObservation(base(),{now});const v=base();
 v.totalUsd=66;v.evidence.observedAt='2026-11-02T17:58:00Z';
 const b=stageComparableFareObservation(v,{now});
 assert.equal(a.comparisonKey,b.comparisonKey);
});
test('different fare products, bags or ticket topology never collide',()=>{
 const a=stageComparableFareObservation(base(),{now}).comparisonKey;
 const b=base();b.ticket.segments[0].fareProduct='GOWILD';
 const c=base();c.ticket.bags.checked=1;
 const d=base();d.ticket.topology='SEPARATE_TICKETS';
 assert.notEqual(a,stageComparableFareObservation(b,{now}).comparisonKey);
 assert.notEqual(a,stageComparableFareObservation(c,{now}).comparisonKey);
 assert.notEqual(a,stageComparableFareObservation(d,{now}).comparisonKey);
});
test('Going email advertisements are rejected',()=>{
 const x=base();x.evidence.kind='GOING_EMAIL';
 const a=stageComparableFareObservation(x,{now});
 assert.equal(a.state,'HOLD');assert.equal(a.snapshot,null);
 assert.ok(a.reasons.includes('NOT_EXACT_AIRLINE_EVIDENCE'));
});
test('source not authenticated or all-in inclusions absent: HOLD',()=>{
 const x=base();x.evidence.sourceAuthenticated=false;x.evidence.baggageAndSeatIncluded=false;
 const y=stageComparableFareObservation(x,{now});
 assert.equal(y.state,'HOLD');assert.ok(y.reasons.includes('SOURCE_NOT_AUTHENTICATED'));
 assert.ok(y.reasons.includes('ALL_IN_COMPARABILITY_NOT_CONFIRMED'));
});
test('missing explicit flight schedule, cabin, or currency: HOLD',()=>{
 const x=base();x.ticket.segments[0].departureAt='';x.ticket.cabin='';x.currency='EUR';
 assert.equal(stageComparableFareObservation(x,{now}).state,'HOLD');
});
test('reject future and stale source times',()=>{
 const f=base();f.evidence.observedAt='2026-11-03T18:00:00Z';
 const s=base();s.evidence.observedAt='2026-01-01T18:00:00Z';
 assert.equal(stageComparableFareObservation(f,{now}).state,'HOLD');
 assert.equal(stageComparableFareObservation(s,{now}).state,'HOLD');
});
test('snapshot cannot become qualified historical observation without separate owner approval',()=>{
 const x=stageComparableFareObservation(base(),{now});
 assert.equal(x.snapshot.metadata.admission_state,'OWNER_REVIEW_REQUIRED');
 assert.equal(x.snapshot.metadata.fare_comparable_total,false);
 assert.equal(x.snapshot.metadata.checkout_total_verified,false);
});
