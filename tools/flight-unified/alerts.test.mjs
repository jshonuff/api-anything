import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeFareHistory} from './alerts.mjs';
const now='2026-11-01T13:00:00Z';
const key='MCI-LAS|2026-11-12|2026-11-19|standard|1adult|personal-only|roundtrip|USD|allin';
function row(price,time,fields={}){
 return {price_amount:price,observed_at:time,currency:'USD',verification_state:'VERIFIED',source_provider:'airline_direct',
 metadata:{fare_comparison_key:key,fare_comparable_total:true,checkout_total_verified:false,...fields.metadata},
 ...Object.fromEntries(Object.entries(fields).filter(([k])=>k!=='metadata'))};
}
test('large same-itinerary drop generates advisory candidate, not a sent alert',()=>{
 const x=analyzeFareHistory([row(230,'2026-10-31T13:00:00Z'),row(190,'2026-11-01T12:00:00Z')],{now})[0];
 assert.equal(x.direction,'PRICE_DROP');assert.equal(x.delta,-40);assert.equal(x.observedLow,190);
 assert.equal(x.checkoutVerified,false);assert.equal(x.advisory,'EVIDENCE_ONLY');assert.equal(x.delivery,'NOT_SENT');
});
test('material increase detected without future price prediction',()=>{
 const x=analyzeFareHistory([row(180,'2026-10-31T12:00:00Z'),row(235,'2026-11-01T12:00:00Z')],{now})[0];
 assert.equal(x.direction,'PRICE_INCREASE');assert.equal(x.delta,55);assert.equal(x.signal,true);
});
test('small changes are quiet, and one observation is insufficient',()=>{
 const one=analyzeFareHistory([row(182,'2026-11-01T12:00:00Z')],{now})[0];
 assert.equal(one.direction,'INSUFFICIENT_HISTORY');
 const two=analyzeFareHistory([row(180,'2026-10-31T12:00:00Z'),row(183,'2026-11-01T12:00:00Z')],{now})[0];
 assert.equal(two.direction,'NO_MATERIAL_CHANGE');assert.equal(two.signal,false);
});
test('stale quotes do not raise live alerts',()=>{
 const x=analyzeFareHistory([row(230,'2026-10-29T12:00:00Z'),row(175,'2026-10-30T12:00:00Z')],{now})[0];
 assert.equal(x.direction,'STALE');assert.equal(x.signal,false);
});
test('rejects unmatched headline prices, unknown/blocked status, and different fare keys',()=>{
 const bad=row(30,'2026-11-01T12:00:00Z',{metadata:{fare_comparable_total:false}});
 const unknown=row(5,'2026-11-01T12:00:00Z',{verification_state:'UNKNOWN'});
 const x=analyzeFareHistory([bad,unknown,row(100,'2026-10-31T12:00:00Z'),
 row(50,'2026-11-01T12:00:00Z',{metadata:{fare_comparison_key:key+'|OTHER_FARE'}})],{now});
 assert.equal(x.length,2);assert.ok(x.every(r=>r.signal===false));
});
test('historical duplicate same-minute samples are not mistaken for distinct prices',()=>{
 const x=analyzeFareHistory([row(190,'2026-11-01T12:00:00Z'),row(190,'2026-11-01T12:00:02Z')],{now})[0];
 assert.equal(x.samples,1);assert.equal(x.direction,'INSUFFICIENT_HISTORY');
});
test('rejects invalid policy and does not infer nonexistent GoWild inventory',()=>{
 assert.throws(()=>analyzeFareHistory([], {now,minChangeFraction:-1}));
 assert.deepEqual(analyzeFareHistory([], {now}),[]);
});
