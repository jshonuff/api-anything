import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFareWatchModel,WATCH_FORMAT} from './fare-watch.mjs';
const now='2026-11-02T20:00:00Z';
const valid=()=>({format:WATCH_FORMAT,exported_at:'2026-11-02T19:59:00Z',
 watch_destinations:['STT','AUS','BRI'],trips:[{trip_id:'TRP-016',status:'CANCELED'}],
 observations:[{id:'1',source_provider:'GOING_GMAIL',currency:'USD',price_amount:484,
 observed_at:'2026-10-29T22:01:52Z',verification_state:'SOURCE_VERIFIED',deal_status:'HISTORICAL',
 source_url:'https://mail.google.com/mail/u/0/#all/example',
 metadata:{gmail_message_id:'abc',origin:'MCI',destination:'STT',travel_window:'Nov-Feb 2027'}}]});
test('render restored airports and source-only price, never a live booking claim',()=>{
 const m=buildFareWatchModel(valid(),{now});assert.equal(m.watchCount,3);
 assert.equal(m.observationCount,1);assert.equal(m.verifiedBookableCount,0);
 assert.equal(m.destinations.find(r=>r.destination==='STT').latest.price,484);
 assert.equal(m.destinations.find(r=>r.destination==='BRI').state,'NO_EMAIL_OBSERVATION');
 assert.equal(m.priceTrend,'NOT_AVAILABLE_WITHOUT_EXACT_COMPARABLE_FARES');
});
test('canceled trips are inactive and do not erase watched airports',()=>{
 const m=buildFareWatchModel(valid(),{now});
 assert.equal(m.canceledTrips[0].status,'INACTIVE');
 assert.ok(m.destinations.some(x=>x.destination==='STT'));
});
test('route identity from metadata only, no subject-label inference',()=>{
 const v=valid();v.observations[0].metadata={gmail_message_id:'abc'};
 const m=buildFareWatchModel(v,{now});assert.equal(m.observationCount,0);
});
test('exclude nonwatched destinations and invalid fares',()=>{
 const v=valid();v.observations.push({...v.observations[0],
  metadata:{gmail_message_id:'new',origin:'MCI',destination:'LAX'}});v.observations.push({
  ...v.observations[0],price_amount:0,metadata:{gmail_message_id:'new2',origin:'MCI',destination:'STT'}});
 assert.equal(buildFareWatchModel(v,{now}).observationCount,1);
});
test('same email route and price does not double count',()=>{
 const v=valid();v.observations.push({...v.observations[0],id:'a copy'});
 assert.equal(buildFareWatchModel(v,{now}).observationCount,1);
});
test('reject future timestamps and non-source airfare products',()=>{
 const v=valid();
 v.observations.push({...v.observations[0],observed_at:'2026-11-03T20:00:00Z',
  metadata:{gmail_message_id:'future',origin:'MCI',destination:'AUS'}});
 v.observations.push({...v.observations[0],source_provider:'OTHER',
  metadata:{gmail_message_id:'other',origin:'MCI',destination:'AUS'}});
 assert.equal(buildFareWatchModel(v,{now}).observationCount,1);
});
test('source links constrained to original HTTPS Gmail host',()=>{
 const v=valid();v.observations[0].source_url='javascript:alert(1)';
 assert.equal(buildFareWatchModel(v,{now}).records[0].sourceUrl,null);
 v.observations[0].source_url='https://mail.google.com.evil.invalid/mail/a';
 assert.equal(buildFareWatchModel(v,{now}).records[0].sourceUrl,null);
});
test('malformed exports and duplicate watch codes fail closed',()=>{
 assert.throws(()=>buildFareWatchModel({}, {now}),/UNSUPPORTED_FORMAT/);
 const v=valid();v.watch_destinations.push('STT');
 assert.throws(()=>buildFareWatchModel(v,{now}),/INVALID_AIRPORTS/);
});
test('no historical email price change signal even for two different offers',()=>{
 const v=valid();v.observations.push({...v.observations[0],price_amount:498,
  observed_at:'2026-10-30T22:01:54Z',metadata:{gmail_message_id:'different',origin:'MCI',destination:'STT'}});
 const m=buildFareWatchModel(v,{now});
 assert.equal(m.destinations.find(x=>x.destination==='STT').latest.price,498);
 assert.equal(m.destinations.find(x=>x.destination==='STT').observations,2);
 assert.equal(m.priceTrend,'NOT_AVAILABLE_WITHOUT_EXACT_COMPARABLE_FARES');
 assert.equal(m.verifiedBookableCount,0);
});
